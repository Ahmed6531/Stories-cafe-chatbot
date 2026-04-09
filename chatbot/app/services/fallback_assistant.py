import logging
import re

import httpx

from app.core.config import settings

try:
    import google.generativeai as genai
    _GENAI_AVAILABLE = True
except ImportError:
    _GENAI_AVAILABLE = False

logger = logging.getLogger(__name__)

GEMINI_MODEL_CANDIDATES = (
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
)

FALLBACK_SYSTEM_PROMPT = (
    "You are Stories Cafe's barista and assistant. "
    "Reply to customers in a friendly, helpful, and concise way using complete sentences. "
    "Do not invent policies, prices, or order status. "
    "If you are unsure, guide the user to menu, cart, or checkout actions."
)


def _safe_static_reply(user_message: str) -> str:
    normalized = (user_message or "").strip().lower()
    if any(token in normalized for token in ["thanks", "thank you", "thx"]):
        return "You're welcome! Happy to help."
    if any(token in normalized for token in ["hi", "hello", "hey"]):
        return "Hi! How can I help with your order today?"
    return "I can help with menu details, cart updates, or checkout."


def _is_incomplete_reply(text: str) -> bool:
    cleaned = (text or "").strip()
    if not cleaned:
        return True

    # Single-word or very short fragments usually indicate a cut-off generation.
    if len(cleaned) < 12:
        return True

    if len(cleaned.split()) < 2:
        return True

    # Handle common dangling starts like: "You're", "I can", "Sure,".
    if cleaned.endswith("'"):
        return True
    if cleaned in {"You're", "You are", "I can", "Sure", "Certainly"}:
        return True

    # Detect dangling trailing clause after a complete sentence,
    # e.g. "That's wonderful to hear! Is there"
    clauses = [part.strip() for part in re.split(r"[.!?]\s+", cleaned) if part.strip()]
    if clauses:
        last_clause = clauses[-1]
        last_words = last_clause.lower().split()
        if 1 <= len(last_words) <= 4:
            if " ".join(last_words) in {
                "is there",
                "are there",
                "would you",
                "can you",
                "can i",
                "do you",
                "shall i",
                "shall we",
                "anything else",
            }:
                return True
            if last_words[0] in {"is", "are", "do", "does", "can", "could", "would", "will", "shall"}:
                return True

    # If the reply ends without terminal punctuation and is very short,
    # it's usually a clipped fragment.
    if cleaned[-1] not in {".", "!", "?"} and len(cleaned.split()) <= 6:
        return True

    return False


def _finalize_reply(user_message: str, reply: str | None) -> str | None:
    if not reply:
        return None
    cleaned = reply.strip()
    if _is_incomplete_reply(cleaned):
        return _safe_static_reply(user_message)
    return cleaned


def _normalize_gemini_model_name(model_name: str | None) -> str:
    normalized = (model_name or "").strip()
    if normalized.startswith("models/"):
        return normalized.split("/", 1)[1]
    return normalized


def _iter_gemini_models(preferred_model: str | None):
    seen = set()
    for model_name in (preferred_model, *GEMINI_MODEL_CANDIDATES):
        normalized = _normalize_gemini_model_name(model_name)
        if normalized and normalized not in seen:
            seen.add(normalized)
            yield normalized


async def _generate_with_azure_openai(user_message: str) -> str | None:
    if not settings.azure_openai_api_key or not settings.azure_openai_endpoint:
        return None

    endpoint = settings.azure_openai_endpoint.rstrip("/")
    url = (
        f"{endpoint}/openai/deployments/{settings.azure_openai_deployment}/chat/completions"
        f"?api-version={settings.azure_openai_api_version}"
    )
    headers = {
        "api-key": settings.azure_openai_api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "messages": [
            {"role": "system", "content": FALLBACK_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.6,
        "max_tokens": 220,
    }

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"].strip()
        return content if content else None
    except Exception as exc:
        logger.warning("Azure fallback assistant call failed: %s", exc)
        return None


async def _generate_with_openai(user_message: str) -> str | None:
    if not settings.openai_api_key:
        return None

    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": FALLBACK_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.6,
        "max_tokens": 220,
    }

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"].strip()
        return content if content else None
    except Exception as exc:
        logger.warning("OpenAI fallback assistant call failed: %s", exc)
        return None


async def _generate_with_gemini(user_message: str) -> str | None:
    if not _GENAI_AVAILABLE or not settings.gemini_api_key:
        return None

    genai.configure(api_key=settings.gemini_api_key)
    last_error = None

    for model_name in _iter_gemini_models(settings.gemini_model):
        try:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=FALLBACK_SYSTEM_PROMPT,
            )
            response = await model.generate_content_async(
                user_message,
                generation_config={"temperature": 0.6, "max_output_tokens": 220},
            )
            content = response.text.strip() if response.text else None

            return content if content else None
        except Exception as exc:
            last_error = exc
            logger.warning("Gemini fallback assistant call failed for model %s: %s", model_name, exc)
            error_text = str(exc).lower()
            if "not found" in error_text or "not supported" in error_text:
                continue
            break

    if last_error:
        logger.warning("Gemini fallback assistant unavailable after model fallbacks: %s", last_error)

    return None


async def generate_fallback_reply(user_message: str) -> str | None:
    message = (user_message or "").strip()
    if not message:
        return None

    provider = (settings.openai_provider or "").lower().strip()

    if provider == "gemini":
        reply = await _generate_with_gemini(message)
        if reply:
            return _finalize_reply(message, reply)
        # cascade to OpenAI then Azure as fallbacks
        reply = await _generate_with_openai(message)
        if reply:
            return _finalize_reply(message, reply)
        return _finalize_reply(message, await _generate_with_azure_openai(message))

    if provider == "azure":
        reply = await _generate_with_azure_openai(message)
        if reply:
            return _finalize_reply(message, reply)
        return _finalize_reply(message, await _generate_with_openai(message))

    if provider == "openai":
        reply = await _generate_with_openai(message)
        if reply:
            return _finalize_reply(message, reply)
        return _finalize_reply(message, await _generate_with_azure_openai(message))

    # unknown provider — try all in order
    reply = await _generate_with_gemini(message)
    if reply:
        return _finalize_reply(message, reply)
    reply = await _generate_with_azure_openai(message)
    if reply:
        return _finalize_reply(message, reply)
    return _finalize_reply(message, await _generate_with_openai(message))
