import asyncio
import base64
import json
import uuid
from contextlib import suppress
from enum import Enum
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool
from app.core.config import settings
from google.cloud import speech
from google.oauth2 import service_account

# ── Google Cloud STT Setup ─────────────────────────────────────────
# 1. Create a GCP project at console.cloud.google.com
# 2. Enable the Cloud Speech-to-Text API
# 3. Create a service account:
#    IAM & Admin → Service Accounts → Create
#    Grant role: "Cloud Speech Client"
# 4. Download the JSON key file
# 5. Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json in .env
# 6. pip install google-cloud-speech==2.27.0
# ──────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/voice", tags=["voice"])

MAX_BYTES = 25 * 1024 * 1024
ALLOWED_MIME_PREFIX = "audio/"
CHUNK_ACK_EVERY = 8
POST_STOP_FINALIZATION_TIMEOUT_SEC = 12.0

# Magic bytes that begin every Opus ID header (RFC 7845 §5.1)
_OPUS_HEAD_MAGIC = b"OpusHead"


class UtteranceState(str, Enum):
    SESSION_OPEN = "session_open"
    RECEIVING_AUDIO = "receiving_audio"
    STOP_RECEIVED = "stop_received"
    FINALIZING = "finalizing"
    TERMINAL_SENT = "terminal_sent"
    CLOSED = "closed"


def _mime_to_encoding(mime_type: str):
    if "ogg" in mime_type:
        return speech.RecognitionConfig.AudioEncoding.OGG_OPUS
    return speech.RecognitionConfig.AudioEncoding.WEBM_OPUS


def _patch_webm_opus_sample_rate(data: bytes, sample_rate: int = 48000) -> tuple[bool, bytes]:
    """
    Chrome's MediaRecorder writes 0 in the Opus ID header's "Input Sample Rate"
    field (bytes 12–15, little-endian).  Zero is technically valid per RFC 7845
    (it means "use the native Opus output rate"), but Google Cloud STT rejects it.
    When sample_rate_hertz is omitted from the STT config (required for WEBM_OPUS),
    we must patch the header in the bitstream instead.

    Returns (patched, data):
      patched=True  — OpusHead was found; sample-rate field was 0 and has been set
                      to sample_rate (or was already non-zero, treated as "done").
      patched=False — OpusHead magic not found in this chunk; try the next one.
    """
    idx = data.find(_OPUS_HEAD_MAGIC)
    if idx == -1:
        return False, data                          # not in this chunk — keep searching

    # OpusHead layout (RFC 7845 §5.1):
    #   0–7  : "OpusHead"  (8 bytes)
    #   8    : version     (1 byte)
    #   9    : channels    (1 byte)
    #   10–11: pre-skip    (2 bytes LE)
    #   12–15: Input Sample Rate (4 bytes LE)  ← Chrome writes 0 here
    rate_offset = idx + 12
    if rate_offset + 4 > len(data):
        # Chunk is truncated mid-header — extremely unlikely but treat as not found
        return False, data

    current_rate = int.from_bytes(data[rate_offset: rate_offset + 4], "little")
    if current_rate != 0:
        return True, data                           # already valid — nothing to rewrite

    patched = data[:rate_offset] + sample_rate.to_bytes(4, "little") + data[rate_offset + 4:]
    return True, patched


def create_speech_client() -> speech.SpeechClient:
    if settings.google_credentials_json:
        info = json.loads(settings.google_credentials_json)
        credentials = service_account.Credentials.from_service_account_info(info)
        return speech.SpeechClient(credentials=credentials)
    return speech.SpeechClient()


@router.get("/health")
async def voice_health() -> dict:
    return {"status": "ok", "message": "Voice routes ready."}


@router.websocket("/stream")
async def transcribe_stream(websocket: WebSocket):
    """
    WebSocket protocol:
    - Client sends JSON {"type":"start","session_id":"...","utterance_id":"...","mime_type":"audio/webm"}
    - Client streams binary audio chunks (or JSON {"type":"audio_chunk","audio_base64":"..."})
    - Client sends JSON {"type":"stop"} to finalize
    - Server replies with JSON events: ready, recording_started, progress, partial_transcript,
      final_transcript, no_speech, timeout, error, pong
    """
    await websocket.accept()
    conn_id = uuid.uuid4().hex[:8]
    print(f"[VOICE][{conn_id}] websocket accepted")

    utterance_state = UtteranceState.SESSION_OPEN
    chunk_count = 0
    total_bytes = 0
    session_id = ""
    utterance_id = ""
    mime_type = "audio/webm"
    final_segments: list[str] = []
    latest_interim = ""
    terminal_event_type: str | None = None
    terminal_send_in_progress = False

    audio_queue: asyncio.Queue | None = None
    result_queue: asyncio.Queue | None = None
    stt_task: asyncio.Task | None = None
    result_task: asyncio.Task | None = None

    def build_transcript(interim_text: str = "") -> str:
        parts = [segment.strip() for segment in final_segments if segment and segment.strip()]
        interim = (interim_text or "").strip()
        if interim:
            parts.append(interim)
        return " ".join(parts).strip()

    def set_utterance_state(next_state: UtteranceState) -> None:
        nonlocal utterance_state
        if utterance_state == next_state:
            return
        print(f"[VOICE][{conn_id}] state {utterance_state.value} -> {next_state.value}")
        utterance_state = next_state

    def has_active_utterance() -> bool:
        return utterance_state in {
            UtteranceState.RECEIVING_AUDIO,
            UtteranceState.STOP_RECEIVED,
            UtteranceState.FINALIZING,
        }

    async def emit_terminal(event_type: str, **payload) -> bool:
        nonlocal terminal_event_type, terminal_send_in_progress
        if terminal_event_type is not None or terminal_send_in_progress:
            print(
                f"[VOICE][{conn_id}] duplicate_terminal_suppressed "
                f"existing={terminal_event_type} ignored={event_type}"
            )
            return False

        terminal_send_in_progress = True
        event = {
            "type": event_type,
            "session_id": session_id,
            "utterance_id": utterance_id,
            **payload,
        }

        try:
            await websocket.send_json(event)
        finally:
            terminal_send_in_progress = False

        terminal_event_type = event_type
        set_utterance_state(UtteranceState.TERMINAL_SENT)
        print(
            f"[VOICE][{conn_id}] terminal_sent type={event_type} "
            f"session={session_id} utterance={utterance_id}"
        )
        return True

    async def start_stt_session() -> None:
        nonlocal audio_queue, result_queue, stt_task, result_task

        _audio_queue: asyncio.Queue = asyncio.Queue()
        _result_queue: asyncio.Queue = asyncio.Queue()
        audio_queue = _audio_queue
        result_queue = _result_queue
        loop = asyncio.get_running_loop()

        encoding = _mime_to_encoding(mime_type)
        print(
            f"[VOICE][{conn_id}] stt_stream_start session={session_id} utterance={utterance_id} "
            f"encoding={encoding} mime_type={mime_type}"
        )
        # Google validates Opus sample rate against the recognition config. In practice
        # WEBM_OPUS and OGG_OPUS both need an explicit supported Opus output rate here.
        is_ogg = "ogg" in mime_type
        recognition_config_kwargs: dict = dict(
            encoding=encoding,
            language_code="en-US",
            #alternative_language_codes=["ar-LB"],
            enable_automatic_punctuation=True,
            sample_rate_hertz=48000,
        )
        print(
            f"[VOICE][{conn_id}] google_config "
            f"encoding={encoding} mime_type={mime_type} "
            f"sample_rate_included={'sample_rate_hertz' in recognition_config_kwargs} "
            f"sample_rate={recognition_config_kwargs.get('sample_rate_hertz')}"
        )

        config = speech.StreamingRecognitionConfig(
            config=speech.RecognitionConfig(**recognition_config_kwargs),
            interim_results=True,
        )

        # For WEBM_OPUS we must patch the OpusHead "Input Sample Rate" field in the
        # bitstream (Chrome writes 0; Google STT rejects it).  The OpusHead lives in
        # the WebM Tracks→TrackEntry→CodecPrivate element, which is always in the
        # initialization segment.  Chrome normally flushes it in the first timeslice
        # chunk, but we scan every chunk until it is found to be safe.
        need_opus_patch = not is_ogg
        opus_header_patched = [False]

        def _audio_gen():
            """Sync generator that drains the async audio_queue for the STT thread."""
            chunk_num = 0
            while True:
                future = asyncio.run_coroutine_threadsafe(_audio_queue.get(), loop)
                chunk = future.result()
                if chunk is None:   # sentinel — stop the stream
                    if need_opus_patch and not opus_header_patched[0]:
                        print(
                            f"[VOICE][{conn_id}] opus_patch_not_found — "
                            f"OpusHead magic never seen in {chunk_num} chunks; "
                            f"Google STT may reject the stream"
                        )
                    return
                chunk_num += 1
                if need_opus_patch and not opus_header_patched[0]:
                    patched, chunk = _patch_webm_opus_sample_rate(chunk)
                    if patched:
                        opus_header_patched[0] = True
                        print(
                            f"[VOICE][{conn_id}] opus_patch_applied chunk={chunk_num} "
                            f"size={len(chunk)}"
                        )
                    else:
                        print(
                            f"[VOICE][{conn_id}] opus_patch_miss chunk={chunk_num} "
                            f"size={len(chunk)} — OpusHead not yet seen"
                        )
                yield speech.StreamingRecognizeRequest(audio_content=chunk)

        def _run_stt() -> None:
            try:
                client = create_speech_client()
                responses = client.streaming_recognize(config, _audio_gen())
                for response in responses:
                    print(f"[VOICE][{conn_id}] stt_response results={bool(response.results)}")
                    for result in response.results:
                        transcript = result.alternatives[0].transcript if result.alternatives else ""
                        print(
                            f'[VOICE][{conn_id}] stt_response results={bool(response.results)} '
                            f'transcript="{transcript}" is_final={result.is_final}'
                        )
                        asyncio.run_coroutine_threadsafe(
                            _result_queue.put(result), loop
                        ).result(timeout=5)
            except Exception as exc:
                asyncio.run_coroutine_threadsafe(
                    _result_queue.put(exc), loop
                ).result(timeout=5)
            finally:
                # Always put the sentinel so _read_results can exit cleanly
                asyncio.run_coroutine_threadsafe(
                    _result_queue.put(None), loop
                ).result(timeout=5)

        async def _read_results() -> None:
            nonlocal latest_interim
            while True:
                item = await _result_queue.get()
                if item is None:
                    print(f"[VOICE][{conn_id}] result_reader_sentinel session={session_id} utterance={utterance_id}")
                    break
                if isinstance(item, Exception):
                    print(f"[VOICE][{conn_id}] google_stt_error: {item}")
                    await emit_terminal("error", message=str(item))
                    break
                result = item
                if not result.alternatives:
                    continue
                text = result.alternatives[0].transcript.strip()
                if result.is_final:
                    if text:
                        final_segments.append(text)
                    latest_interim = ""
                    snapshot = build_transcript()
                else:
                    latest_interim = text
                    snapshot = build_transcript(latest_interim)

                if not snapshot:
                    continue

                # App-level terminal transcript events should only be sent after
                # the browser sends {type:"stop"}. Google may emit multiple
                # is_final segments while the utterance is still in progress.
                await websocket.send_json({
                    "type": "partial_transcript",
                    "snapshot": snapshot,
                    "delta": text,
                    "utterance_id": utterance_id,
                    "session_id": session_id,
                    "chunks": chunk_count,
                })

        stt_task = asyncio.create_task(run_in_threadpool(_run_stt))
        result_task = asyncio.create_task(_read_results())

    async def stop_stt(timeout_seconds: float | None = None) -> bool:
        """Signal the STT stream to stop, then wait for both tasks to finish."""
        nonlocal audio_queue, result_queue, stt_task, result_task
        timed_out = False
        loop = asyncio.get_running_loop()

        def remaining_timeout(deadline: float | None) -> float | None:
            if deadline is None:
                return None
            return max(0.0, deadline - loop.time())

        deadline = None
        if timeout_seconds is not None:
            deadline = loop.time() + timeout_seconds

        if audio_queue is not None:
            await audio_queue.put(None)  # sentinel wakes up _audio_gen
        if stt_task is not None:
            try:
                timeout = remaining_timeout(deadline)
                if timeout is None:
                    await stt_task
                else:
                    await asyncio.wait_for(asyncio.shield(stt_task), timeout=timeout)
            except asyncio.TimeoutError:
                timed_out = True
                print(
                    f"[VOICE][{conn_id}] stop_stt_timeout stage=stt_task "
                    f"session={session_id} utterance={utterance_id}"
                )
            except Exception:
                pass
        if result_queue is not None and result_task is not None and not result_task.done():
            result_queue.put_nowait(None)  # fallback in case the worker never delivered its sentinel
        if result_task is not None:
            try:
                timeout = remaining_timeout(deadline)
                if timeout is None:
                    await result_task
                else:
                    await asyncio.wait_for(asyncio.shield(result_task), timeout=timeout)
            except asyncio.TimeoutError:
                timed_out = True
                print(
                    f"[VOICE][{conn_id}] stop_stt_timeout stage=result_task "
                    f"session={session_id} utterance={utterance_id}"
                )
            except Exception:
                pass
        if timed_out:
            if stt_task is not None and not stt_task.done():
                stt_task.cancel()
            if result_task is not None and not result_task.done():
                result_task.cancel()
                with suppress(Exception):
                    await result_task
        audio_queue = None
        result_queue = None
        stt_task = None
        result_task = None
        print(
            f"[VOICE][{conn_id}] stt_stream_closed session={session_id} utterance={utterance_id} "
            f"chunk_count={chunk_count} total_bytes={total_bytes}"
        )
        return not timed_out

    await websocket.send_json({
        "type": "ready",
        "message": "voice websocket connected",
        "max_bytes": MAX_BYTES,
    })

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                print(f"[VOICE][{conn_id}] socket closed")
                set_utterance_state(UtteranceState.CLOSED)
                break

            # ── Binary audio chunk ──────────────────────────────────────────
            if message.get("bytes") is not None:
                if utterance_state != UtteranceState.RECEIVING_AUDIO:
                    if utterance_state in {
                        UtteranceState.STOP_RECEIVED,
                        UtteranceState.FINALIZING,
                        UtteranceState.TERMINAL_SENT,
                    }:
                        print(f"[VOICE][{conn_id}] ignored_late_chunk_after_stop size={len(message['bytes'])}")
                        continue
                    print(
                        f"[VOICE][{conn_id}] send_start_before_binary "
                        f"state={utterance_state.value}"
                    )
                    await websocket.send_json({"type": "error", "message": "send start before binary chunks"})
                    continue

                raw = message["bytes"]
                total_bytes += len(raw)
                chunk_count += 1
                if chunk_count == 1:
                    print(f"[VOICE][{conn_id}] first_chunk size={len(raw)} header_hex={raw[:20].hex()}")
                print(f"[VOICE][{conn_id}] chunk_count={chunk_count} total_bytes={total_bytes}")

                if total_bytes > MAX_BYTES:
                    await stop_stt()
                    await emit_terminal("error", message="audio exceeds 25 MB")
                    continue

                if audio_queue is not None:
                    await audio_queue.put(raw)

                if chunk_count % CHUNK_ACK_EVERY == 0:
                    await websocket.send_json({
                        "type": "progress",
                        "chunks": chunk_count,
                        "bytes": total_bytes,
                        "utterance_id": utterance_id,
                    })
                continue

            # ── JSON control message ────────────────────────────────────────
            text_payload = message.get("text")
            if text_payload is None:
                continue

            try:
                payload = json.loads(text_payload)
            except Exception:
                await websocket.send_json({"type": "error", "message": "invalid json payload"})
                continue

            event_type = payload.get("type")

            if event_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if event_type == "start":
                if has_active_utterance():
                    await emit_terminal("error", message="utterance already in progress")
                    continue

                chunk_count = 0
                total_bytes = 0
                final_segments = []
                latest_interim = ""
                terminal_event_type = None
                session_id = str(payload.get("session_id") or "")
                utterance_id = str(payload.get("utterance_id") or uuid.uuid4())
                mime_type = str(payload.get("mime_type") or "audio/webm")
                if not mime_type.startswith(ALLOWED_MIME_PREFIX):
                    mime_type = "audio/webm"
                print(
                    f"[VOICE][{conn_id}] start session={session_id} "
                    f"utterance={utterance_id} mime_type={mime_type}"
                )

                await start_stt_session()
                set_utterance_state(UtteranceState.RECEIVING_AUDIO)

                await websocket.send_json({
                    "type": "recording_started",
                    "session_id": session_id,
                    "utterance_id": utterance_id,
                    "mime_type": mime_type,
                })
                continue

            if event_type == "audio_chunk":
                if utterance_state != UtteranceState.RECEIVING_AUDIO:
                    if utterance_state in {
                        UtteranceState.STOP_RECEIVED,
                        UtteranceState.FINALIZING,
                        UtteranceState.TERMINAL_SENT,
                    }:
                        print(f"[VOICE][{conn_id}] ignored_late_base64_chunk_after_stop")
                        continue
                    await websocket.send_json({"type": "error", "message": "send start before chunk"})
                    continue

                audio_b64 = payload.get("audio_base64")
                if not isinstance(audio_b64, str) or not audio_b64:
                    await websocket.send_json({"type": "error", "message": "chunk requires audio_base64"})
                    continue

                try:
                    raw = base64.b64decode(audio_b64)
                except Exception:
                    await websocket.send_json({"type": "error", "message": "invalid base64 audio chunk"})
                    continue

                total_bytes += len(raw)
                chunk_count += 1
                if chunk_count == 1:
                    print(f"[VOICE][{conn_id}] first_chunk size={len(raw)} header_hex={raw[:20].hex()}")
                print(f"[VOICE][{conn_id}] chunk_count={chunk_count} total_bytes={total_bytes}")

                if total_bytes > MAX_BYTES:
                    await stop_stt()
                    await emit_terminal("error", message="audio exceeds 25 MB")
                    continue

                if audio_queue is not None:
                    await audio_queue.put(raw)

                if chunk_count % CHUNK_ACK_EVERY == 0:
                    await websocket.send_json({
                        "type": "progress",
                        "chunks": chunk_count,
                        "bytes": total_bytes,
                        "utterance_id": utterance_id,
                    })
                continue

            if event_type == "stop":
                if utterance_state != UtteranceState.RECEIVING_AUDIO:
                    await websocket.send_json({"type": "error", "message": "no active utterance"})
                    continue

                set_utterance_state(UtteranceState.STOP_RECEIVED)
                print(
                    f"[VOICE][{conn_id}] stop received session={session_id} utterance={utterance_id} "
                    f"chunk_count={chunk_count} total_bytes={total_bytes}"
                )

                if total_bytes == 0:
                    await stop_stt()
                    await emit_terminal(
                        "no_speech",
                        transcript="",
                    )
                    continue

                # Signal STT stream to close, then emit one app-level terminal
                # outcome built from the collected Google results.
                set_utterance_state(UtteranceState.FINALIZING)
                finalized = await stop_stt(timeout_seconds=POST_STOP_FINALIZATION_TIMEOUT_SEC)
                if not finalized:
                    await emit_terminal(
                        "timeout",
                        message="STT finalization timed out",
                        phase="post_stop_finalization",
                    )
                    continue
                if terminal_event_type is not None:
                    continue

                transcript = build_transcript(latest_interim)
                if transcript:
                    await emit_terminal(
                        "final_transcript",
                        transcript=transcript,
                        chunks=chunk_count,
                        bytes=total_bytes,
                    )
                else:
                    await emit_terminal(
                        "no_speech",
                        transcript="",
                        chunks=chunk_count,
                        bytes=total_bytes,
                    )
                continue

            await websocket.send_json({"type": "error", "message": f"unsupported event type: {event_type}"})

    except WebSocketDisconnect:
        print(f"[VOICE][{conn_id}] socket closed")
        await stop_stt()
        set_utterance_state(UtteranceState.CLOSED)
        return
