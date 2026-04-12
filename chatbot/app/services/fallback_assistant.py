import logging
import re
from collections.abc import Awaitable, Callable

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

FALLBACK_TEMPERATURE = 0.35
FALLBACK_MAX_TOKENS = 420
FALLBACK_HTTP_TIMEOUT_SECONDS = 6.0


def _safe_static_reply(user_message: str) -> str:
    normalized = (user_message or "").strip().lower()
    if any(token in normalized for token in ["thanks", "thank you", "thx"]):
        return "You're welcome! Happy to help."
    if any(token in normalized for token in ["hi", "hello", "hey"]):
        return "Hi! How can I help with your order today?"
    return "I didn't quite understand that. Can you repeat or rephrase?"


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

    # Common clipped endings in model output.
    if cleaned.endswith((":", ";", ",", " -", " --", "(", "[", "{")):
        return True
    if cleaned.count("(") > cleaned.count(")"):
        return True
    if cleaned.count("[") > cleaned.count("]"):
        return True
    if cleaned.count("{") > cleaned.count("}"):
        return True

    # Trailing connector words usually mean an unfinished thought.
    trailing_words = cleaned.lower().split()
    if trailing_words:
        if trailing_words[-1] in {
            "and", "or", "but", "with", "to", "for", "of", "in", "on", "because",
            "if", "when", "while", "that", "which",
        }:
            return True

    return False


async def _generate_complete_reply_once(
    user_message: str,
    generate_fn: Callable[[str], Awaitable[str | None]],
) -> str | None:
    """Generate a fallback reply and retry once if the first reply is clipped."""
    first = await generate_fn(user_message)
    if not first:
        return None

    first_clean = first.strip()
    if first_clean and not _is_incomplete_reply(first_clean):
        return first_clean

    retry_prompt = (
        f"{user_message}\n\n"
        "Please answer in one or two complete sentences and finish your thought."
    )
    second = await generate_fn(retry_prompt)
    if not second:
        return _safe_static_reply(user_message)

    second_clean = second.strip()
    if second_clean and not _is_incomplete_reply(second_clean):
        return second_clean

    return _safe_static_reply(user_message)


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
        "temperature": FALLBACK_TEMPERATURE,
        "max_tokens": FALLBACK_MAX_TOKENS,
    }

    try:
        async with httpx.AsyncClient(timeout=FALLBACK_HTTP_TIMEOUT_SECONDS) as client:
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
        "temperature": FALLBACK_TEMPERATURE,
        "max_tokens": FALLBACK_MAX_TOKENS,
    }

    try:
        async with httpx.AsyncClient(timeout=FALLBACK_HTTP_TIMEOUT_SECONDS) as client:
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
                generation_config={
                    "temperature": FALLBACK_TEMPERATURE,
                    "max_output_tokens": FALLBACK_MAX_TOKENS,
                },
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
        reply = await _generate_complete_reply_once(message, _generate_with_gemini)
        if reply:
            return reply
        # cascade to OpenAI then Azure as fallbacks
        reply = await _generate_complete_reply_once(message, _generate_with_openai)
        if reply:
            return reply
        return await _generate_complete_reply_once(message, _generate_with_azure_openai)

    if provider == "azure":
        reply = await _generate_complete_reply_once(message, _generate_with_azure_openai)
        if reply:
            return reply
        return await _generate_complete_reply_once(message, _generate_with_openai)

    if provider == "openai":
        reply = await _generate_complete_reply_once(message, _generate_with_openai)
        if reply:
            return reply
        return await _generate_complete_reply_once(message, _generate_with_azure_openai)

    # unknown provider — try all in order
    reply = await _generate_complete_reply_once(message, _generate_with_gemini)
    if reply:
        return reply
    reply = await _generate_complete_reply_once(message, _generate_with_azure_openai)
    if reply:
        return reply
    return await _generate_complete_reply_once(message, _generate_with_openai)
