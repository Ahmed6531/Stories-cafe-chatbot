import asyncio
import base64
import json
import uuid
from contextlib import suppress
from fastapi import APIRouter, HTTPException, UploadFile, File, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool
from app.schemas.voice import VoiceTranscriptionResponse
from app.core.config import settings
from groq import Groq

router = APIRouter(prefix="/voice", tags=["voice"])

MAX_BYTES = 25 * 1024 * 1024
ALLOWED_MIME_PREFIX = "audio/"
CHUNK_ACK_EVERY = 8
PARTIAL_EVERY_CHUNKS = 2
MIN_PARTIAL_BYTES = 1_500
PARTIAL_WINDOW_BYTES = 220_000
PARTIAL_COOLDOWN_SEC = 0.22
PARTIAL_DELTA_MAX_WORDS = 8


def _build_partial_update(previous: str, current: str) -> tuple[str, str]:
    """
    Returns (snapshot, delta).
    - snapshot: full text to replace current client-side live text
    - delta: tail words to append client-side
    """
    prev = previous.strip()
    curr = current.strip()

    if not curr:
        return "", ""
    if not prev:
        return curr, ""

    prev_tokens = prev.split()
    curr_tokens = curr.split()

    i = 0
    while i < len(prev_tokens) and i < len(curr_tokens) and prev_tokens[i] == curr_tokens[i]:
        i += 1

    # If model significantly rewrote earlier tokens, resync with full snapshot.
    if i < max(1, len(prev_tokens) // 2):
        return curr, ""

    appended = curr_tokens[i:]
    if not appended:
        return "", ""

    if len(appended) > PARTIAL_DELTA_MAX_WORDS:
        appended = appended[-PARTIAL_DELTA_MAX_WORDS:]

    return "", " ".join(appended)


def _transcribe_bytes(contents: bytes, filename: str, mime_type: str) -> str:
    client = Groq(api_key=settings.groq_api_key)
    transcription = client.audio.transcriptions.create(
        model=settings.stt_model,
        file=(filename, contents, mime_type),
        language=settings.stt_language,
        response_format="json",
        prompt=(
            "latte cappuccino americano espresso mocha macchiato frap frappuccino "
            "flat white matcha chai oat milk almond milk whole milk skim milk "
            "large medium small iced hot decaf extra shot no foam vanilla caramel hazelnut"
        ),
    )
    return transcription.text or ""

@router.get("/health")
async def voice_health() -> dict:
    return {"status": "ok", "message": "Voice routes ready."}

@router.post("/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_audio(audio: UploadFile = File(...)):
    if not settings.groq_api_key:
        raise HTTPException(status_code=500, detail="Missing GROQ_API_KEY")

    if not audio.content_type or not audio.content_type.startswith(ALLOWED_MIME_PREFIX):
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {audio.content_type}")

    contents = await audio.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Missing or empty audio file")
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Audio file exceeds 25 MB limit")

    filename = audio.filename or "speech.wav"
    mime_type = audio.content_type or "audio/wav"

    try:
        text = await run_in_threadpool(_transcribe_bytes, contents, filename, mime_type)
        return VoiceTranscriptionResponse(transcript=text, status="success")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@router.websocket("/stream")
async def transcribe_stream(websocket: WebSocket):
    """
    WebSocket protocol:
    - Client sends JSON {"type":"start","session_id":"...","utterance_id":"...","mime_type":"audio/webm"}
    - Client streams binary audio chunks (or JSON {"type":"chunk","audio_base64":"..."})
    - Client sends JSON {"type":"end"} to finalize and transcribe
    - Server replies with JSON events: ready, started, progress, final, error, pong
    """
    await websocket.accept()

    started = False
    chunk_count = 0
    audio_bytes = bytearray()
    session_id = ""
    utterance_id = ""
    mime_type = "audio/webm"
    filename = "speech.webm"
    last_partial_text = ""
    partial_task: asyncio.Task | None = None
    loop = asyncio.get_running_loop()
    next_partial_at = 0.0

    async def try_emit_partial() -> None:
        nonlocal partial_task, last_partial_text, next_partial_at
        if not started:
            return
        if len(audio_bytes) < MIN_PARTIAL_BYTES:
            return
        if chunk_count % PARTIAL_EVERY_CHUNKS != 0:
            return
        now = loop.time()
        if now < next_partial_at:
            return
        if partial_task and not partial_task.done():
            return

        next_partial_at = now + PARTIAL_COOLDOWN_SEC
        partial_audio = bytes(audio_bytes[-PARTIAL_WINDOW_BYTES:])
        partial_chunks = chunk_count
        partial_utterance_id = utterance_id
        partial_session_id = session_id
        partial_filename = filename
        partial_mime_type = mime_type

        async def run_partial() -> None:
            nonlocal last_partial_text
            try:
                partial = await run_in_threadpool(
                    _transcribe_bytes,
                    partial_audio,
                    partial_filename,
                    partial_mime_type,
                )
                partial = partial.strip()
                if partial and partial != last_partial_text:
                    snapshot, delta = _build_partial_update(last_partial_text, partial)
                    last_partial_text = partial
                    await websocket.send_json({
                        "type": "partial",
                        "snapshot": snapshot,
                        "delta": delta,
                        "utterance_id": partial_utterance_id,
                        "session_id": partial_session_id,
                        "chunks": partial_chunks,
                    })
            except Exception:
                # Keep stream alive even if an interim pass fails.
                pass

        partial_task = asyncio.create_task(run_partial())

    await websocket.send_json({
        "type": "ready",
        "message": "voice websocket connected",
        "max_bytes": MAX_BYTES,
    })

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            if message.get("bytes") is not None:
                if not started:
                    await websocket.send_json({"type": "error", "message": "send start before binary chunks"})
                    continue

                audio_bytes.extend(message["bytes"])
                chunk_count += 1

                if len(audio_bytes) > MAX_BYTES:
                    started = False
                    audio_bytes.clear()
                    await websocket.send_json({"type": "error", "message": "audio exceeds 25 MB"})
                    continue

                if chunk_count % CHUNK_ACK_EVERY == 0:
                    await websocket.send_json({
                        "type": "progress",
                        "chunks": chunk_count,
                        "bytes": len(audio_bytes),
                        "utterance_id": utterance_id,
                    })
                await try_emit_partial()
                continue

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
                if not settings.groq_api_key:
                    await websocket.send_json({"type": "error", "message": "Missing GROQ_API_KEY"})
                    continue

                started = True
                chunk_count = 0
                audio_bytes.clear()
                last_partial_text = ""
                session_id = str(payload.get("session_id") or "")
                utterance_id = str(payload.get("utterance_id") or uuid.uuid4())
                mime_type = str(payload.get("mime_type") or "audio/webm")
                if not mime_type.startswith(ALLOWED_MIME_PREFIX):
                    mime_type = "audio/webm"

                ext = "wav" if "wav" in mime_type else ("ogg" if "ogg" in mime_type else "webm")
                filename = f"speech.{ext}"

                await websocket.send_json({
                    "type": "started",
                    "session_id": session_id,
                    "utterance_id": utterance_id,
                    "mime_type": mime_type,
                })
                continue

            if event_type == "chunk":
                if not started:
                    await websocket.send_json({"type": "error", "message": "send start before chunk"})
                    continue

                audio_b64 = payload.get("audio_base64")
                if not isinstance(audio_b64, str) or not audio_b64:
                    await websocket.send_json({"type": "error", "message": "chunk requires audio_base64"})
                    continue

                try:
                    chunk = base64.b64decode(audio_b64)
                except Exception:
                    await websocket.send_json({"type": "error", "message": "invalid base64 audio chunk"})
                    continue

                audio_bytes.extend(chunk)
                chunk_count += 1

                if len(audio_bytes) > MAX_BYTES:
                    started = False
                    audio_bytes.clear()
                    await websocket.send_json({"type": "error", "message": "audio exceeds 25 MB"})
                    continue

                if chunk_count % CHUNK_ACK_EVERY == 0:
                    await websocket.send_json({
                        "type": "progress",
                        "chunks": chunk_count,
                        "bytes": len(audio_bytes),
                        "utterance_id": utterance_id,
                    })
                await try_emit_partial()
                continue

            if event_type == "end":
                if not started:
                    await websocket.send_json({"type": "error", "message": "no active utterance"})
                    continue

                if len(audio_bytes) == 0:
                    started = False
                    if partial_task and not partial_task.done():
                        partial_task.cancel()
                        with suppress(asyncio.CancelledError):
                            await partial_task
                    partial_task = None
                    await websocket.send_json({
                        "type": "final",
                        "status": "success",
                        "transcript": "",
                        "utterance_id": utterance_id,
                        "session_id": session_id,
                    })
                    continue

                try:
                    if partial_task and not partial_task.done():
                        partial_task.cancel()
                        with suppress(asyncio.CancelledError):
                            await partial_task
                    partial_task = None

                    transcript = await run_in_threadpool(
                        _transcribe_bytes,
                        bytes(audio_bytes),
                        filename,
                        mime_type,
                    )
                    await websocket.send_json({
                        "type": "final",
                        "status": "success",
                        "transcript": transcript,
                        "utterance_id": utterance_id,
                        "session_id": session_id,
                        "chunks": chunk_count,
                        "bytes": len(audio_bytes),
                    })
                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Transcription failed: {str(e)}",
                        "utterance_id": utterance_id,
                        "session_id": session_id,
                    })
                finally:
                    started = False
                    chunk_count = 0
                    audio_bytes.clear()
                    last_partial_text = ""
                    partial_task = None
                continue

            await websocket.send_json({"type": "error", "message": f"unsupported event type: {event_type}"})

    except WebSocketDisconnect:
        if partial_task and not partial_task.done():
            partial_task.cancel()
            with suppress(asyncio.CancelledError):
                await partial_task
        return