import asyncio
import json
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.cloud import speech
from google.oauth2 import service_account
from starlette.concurrency import run_in_threadpool

from app.core.config import settings

router = APIRouter(prefix="/voice", tags=["voice"])

_OPUS_MAGIC = b"OpusHead"
_PHRASES = [
    # Yogurts
    "Frozen Yogurt Combo", "Frozen Yogurt", "Pistachio Frozen Yogurt",
    # Coffee
    "Espresso", "Flat White", "Hot Double Shot", "Caramel Macchiato",
    "Latte", "Hot Chocolate", "Cappuccino", "Mocha", "White Mocha",
    "Matcha Latte", "Double Espresso Macchiato", "Double Espresso",
    "Espresso Macchiato", "Filtered Coffee", "Americano",
    # Tea
    "Earl Grey", "English Breakfast", "Green Tea", "Mint Tea", "Iced Peach Tea",
    # Pastries
    "Thyme Croissant", "Chocolate Croissant", "Cheese Croissant",
    "Double Chocolate Chip Walnut", "Cinnamon Rolls", "Lazy Cake",
    "Nutella Roll", "Strawberry Dried Drops",
    # Mixed Beverages
    "Steamed Milk", "Iced Mocha", "Hazelnut Coffee Frap", "Coffee Frap",
    "Vanilla Coffee Frap", "Strawberry Cream Frap", "Matcha Cream Frap",
    "Vanilla Cream Frap", "Caramel Cream Frap", "Chocolate Cream Frap",
    "White Mocha Frap", "White Mocha Cream Frap", "Iced Chocolate",
    "Double Shot Shaken", "Iced Matcha", "Iced Americano", "Bluenade",
    "Caramel Frap", "Mocha Frap", "Espresso Frap", "Iced Latte",
    "Iced White Mocha", "Iced Caramel Macchiato",
    # Salad
    "Tuna Pasta Salad", "Rocca Salad", "Greek Salad", "Quinoa Salad",
    # Soft Drinks
    "Rim Sparkling Water", "Rim 330ML", "San Benedetto Lemon 330ML",
    "San Benedetto Clementine 330", "San Benedetto Glass 250", "Balkis Juice",
    # Sandwiches
    "Tuna Sub", "Chicken Teriyaki", "Turkey & Cheese", "Labneh", "Halloumi Pesto",
    # Order modifiers
    "small", "medium", "large", "iced", "hot",
    "oat milk", "almond milk", "soy milk",
    "extra shot", "no sugar", "decaf",
    "add", "remove", "order", "repeat my last order",
    "what's good today", "surprise me",
]


def _patch_opus_head(data: bytes) -> bytes:
    """Patch Chrome's zero-filled Input Sample Rate field in the OpusHead header."""
    idx = data.find(_OPUS_MAGIC)
    if idx == -1:
        return data
    off = idx + 12
    if off + 4 > len(data) or int.from_bytes(data[off : off + 4], "little") != 0:
        return data
    return data[:off] + (48000).to_bytes(4, "little") + data[off + 4:]


def _make_client() -> speech.SpeechClient:
    if settings.google_credentials_json:
        info = json.loads(settings.google_credentials_json)
        creds = service_account.Credentials.from_service_account_info(info)
        return speech.SpeechClient(credentials=creds)
    return speech.SpeechClient()


@router.websocket("/stream")
async def voice_stream(websocket: WebSocket):
    await websocket.accept()
    conn_id = uuid.uuid4().hex[:8]

    aq: asyncio.Queue = asyncio.Queue()
    rq: asyncio.Queue = asyncio.Queue()
    final_segments: list[str] = []
    latest_interim = ""
    session_id = utterance_id = ""
    first_chunk = True
    terminal_sent = False
    st = rt = None

    cfg = speech.StreamingRecognitionConfig(
        config=speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
            sample_rate_hertz=48000,
            language_code="en-US",
            alternative_language_codes=["ar-LB"],
            enable_automatic_punctuation=True,
            model="latest_short",
            audio_channel_count=1,
            speech_contexts=[speech.SpeechContext(phrases=_PHRASES, boost=20.0)],
        ),
        interim_results=True,
    )

    def build(interim: str = "") -> str:
        parts = [s for s in final_segments if s.strip()]
        if interim.strip():
            parts.append(interim.strip())
        return " ".join(parts).strip()

    loop = asyncio.get_running_loop()

    def _gen():
        while True:
            chunk = asyncio.run_coroutine_threadsafe(aq.get(), loop).result()
            if chunk is None:
                return
            yield speech.StreamingRecognizeRequest(audio_content=chunk)

    def _stt():
        try:
            for resp in _make_client().streaming_recognize(cfg, _gen()):
                for result in resp.results:
                    asyncio.run_coroutine_threadsafe(rq.put(result), loop).result(timeout=5)
        except Exception as exc:
            asyncio.run_coroutine_threadsafe(rq.put(exc), loop).result(timeout=5)
        finally:
            asyncio.run_coroutine_threadsafe(rq.put(None), loop).result(timeout=5)

    async def _results():
        nonlocal latest_interim, terminal_sent
        while True:
            item = await rq.get()
            if item is None:
                break
            if isinstance(item, Exception):
                terminal_sent = True
                await websocket.send_json({"type": "error", "message": str(item)})
                break
            if not item.alternatives:
                continue
            text = item.alternatives[0].transcript.strip()
            if item.is_final:
                if text:
                    final_segments.append(text)
                latest_interim = ""
                await websocket.send_json({"type": "partial", "confirmed": build(), "interim": ""})
            else:
                latest_interim = text
                await websocket.send_json({"type": "partial", "confirmed": build(), "interim": text})

    try:
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                break

            if (raw := msg.get("bytes")) is not None:
                if first_chunk:
                    raw = _patch_opus_head(raw)
                    first_chunk = False
                await aq.put(raw)
                continue

            if not (text := msg.get("text")):
                continue
            payload = json.loads(text)
            ev = payload.get("type")

            if ev == "start":
                session_id = str(payload.get("session_id") or "")
                utterance_id = str(payload.get("utterance_id") or uuid.uuid4())
                print(f"[VOICE][{conn_id}] start session={session_id} utterance={utterance_id}")
                st = asyncio.create_task(run_in_threadpool(_stt))
                rt = asyncio.create_task(_results())
                continue

            if ev == "stop":
                await aq.put(None)
                try:
                    await asyncio.wait_for(asyncio.gather(st, rt), timeout=12.0)
                except asyncio.TimeoutError:
                    terminal_sent = True
                    await websocket.send_json({"type": "error", "kind": "timeout", "message": "STT timed out"})
                if not terminal_sent:
                    transcript = build(latest_interim)
                    if transcript:
                        await websocket.send_json({"type": "final", "text": transcript, "utterance_id": utterance_id})
                    else:
                        await websocket.send_json({"type": "no_speech"})
                break

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        if not terminal_sent:
            try:
                await websocket.send_json({"type": "error", "message": str(exc)})
            except Exception:
                pass
    finally:
        await aq.put(None)
        if st and not st.done():
            st.cancel()
        if rt and not rt.done():
            rt.cancel()
        print(f"[VOICE][{conn_id}] closed session={session_id}")
