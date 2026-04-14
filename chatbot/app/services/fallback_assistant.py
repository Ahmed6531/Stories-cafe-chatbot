import logging
import re
from collections.abc import Awaitable, Callable

import httpx

from app.core.config import settings

genai = None

try:
    import google.generativeai as genai

    _GENAI_AVAILABLE = True
except ImportError:
    _GENAI_AVAILABLE = False

logger = logging.getLogger(__name__)

_FALLBACK_TEMPERATURE = 0.35
FALLBACK_MAX_TOKENS = 420
FALLBACK_HTTP_TIMEOUT_SECONDS = 6.0
GEMINI_MODEL_CANDIDATES = (
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
)

_FALLBACK_BASE_PROMPT = (
    "You are the transactional ordering assistant for Stories Cafe. "
    "You help customers order food and drinks, answer menu questions, "
    "and assist with their cart. "
    "Keep replies short, neutral, and professional. "
    "Do not flirt, make romantic jokes, compliment the user's appearance or personality, "
    "use pet names, tease, roleplay, or ask personal questions unrelated to the order. "
    "Do not sound intimate, playful, or emotionally suggestive. "
    "Never fabricate cart actions, menu items, prices, or order status. "
    "Redirect unclear or off-topic messages back to ordering help in one or two sentences. "
    "Prefer transactional language about menu details, cart updates, and checkout."
)

_FALLBACK_REASON_HINTS: dict[str, str] = {
    "bare_affirmation_needs_context": (
        " The customer said yes/ok/sure with no clear context. "
        "Ask what they meant - for example: "
        "'Just to confirm - did you want to checkout, or is there something else I can help with?'"
    ),
    "entity_not_found": (
        " The item the user mentioned was not found on the menu. "
        "Acknowledge this politely and ask them to clarify or browse the menu."
    ),
    "low_confidence": (
        " The request was unclear. "
        "Gently ask the customer to rephrase what they would like to do."
    ),
    "unknown_intent": (
        " The customer said something unclear or unexpected. "
        "Do not say 'Welcome' - they are already in a conversation. "
        "Respond as if you did not quite catch what they meant: "
        "ask them what they would like to order or how you can help. "
        "Keep it to one or two sentences."
    ),
    "llm_parse_failed": (
        " There was a technical issue parsing the request. "
        "Apologize briefly and ask the customer to try again."
    ),
    "repeat_order_no_history": (
        " The customer wants to repeat a previous order but no history is available. "
        "Let them know and invite them to place a fresh order."
    ),
}


def _build_fallback_system_prompt(reason: str) -> str:
    return _FALLBACK_BASE_PROMPT + _FALLBACK_REASON_HINTS.get(reason, "")


FALLBACK_SYSTEM_PROMPT = _FALLBACK_BASE_PROMPT

_OFF_SCRIPT_REPLY_PATTERNS = (
    r"\bbabe\b",
    r"\bbaby\b",
    r"\bcutie\b",
    r"\bsweetheart\b",
    r"\bhandsome\b",
    r"\bbeautiful\b",
    r"\bgorgeous\b",
    r"\bmy love\b",
    r"\blove\b.*\byou\b",
    r"\bdate\b",
    r"\bflirt\b",
    r"\bkiss\b",
)

_SAFE_STATIC_REPLY_TABLE: dict[str, str] = {
    "hi": "Hi! What can I get for you today?",
    "hey": "Hey! What can I get for you?",
    "hello": "Hello! What would you like to order?",
    "hiya": "Hi there! What can I get you?",
    "good morning": "Good morning! What can I get for you?",
    "good afternoon": "Good afternoon! What would you like?",
    "good evening": "Good evening! What can I get for you?",
    "thanks": "You're welcome! Anything else?",
    "thank you": "You're welcome! Let me know if you need anything else.",
    "thx": "You're welcome!",
    "cheers": "Cheers! Anything else I can help with?",
    "great": "Great! Anything else?",
    "perfect": "Perfect! Anything else?",
    "awesome": "Glad to help! Anything else?",
}


def _safe_static_reply(user_message: str) -> str:
    normalized = " ".join((user_message or "").strip().lower().split())
    static_reply = _SAFE_STATIC_REPLY_TABLE.get(normalized)
    if static_reply:
        return static_reply
    return "I can help with menu details, cart updates, or checkout."


def _is_incomplete_reply(text: str) -> bool:
    cleaned = (text or "").strip()
    if not cleaned:
        return True

    if len(cleaned) < 12:
        return True

    if len(cleaned.split()) < 2:
        return True

    if cleaned.endswith("'"):
        return True
    if cleaned in {"You're", "You are", "I can", "Sure", "Certainly"}:
        return True

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

    if cleaned[-1] not in {".", "!", "?"} and len(cleaned.split()) <= 18:
        return True

    if cleaned.endswith((":", ";", ",", " -", " --", "(", "[", "{")):
        return True
    if cleaned.count("(") > cleaned.count(")"):
        return True
    if cleaned.count("[") > cleaned.count("]"):
        return True
    if cleaned.count("{") > cleaned.count("}"):
        return True

    trailing_words = cleaned.lower().split()
    if trailing_words:
        if trailing_words[-1] in {
            "and",
            "or",
            "but",
            "with",
            "to",
            "for",
            "of",
            "in",
            "on",
            "because",
            "if",
            "when",
            "while",
            "that",
            "which",
        }:
            return True
        if trailing_words[-1] in {
            "other",
            "another",
            "more",
            "different",
            "various",
            "several",
            "many",
            "some",
            "those",
            "these",
        }:
            return True

    return False


def _looks_off_script_reply(text: str) -> bool:
    cleaned = (text or "").strip().lower()
    if not cleaned:
        return False
    return any(re.search(pattern, cleaned) for pattern in _OFF_SCRIPT_REPLY_PATTERNS)


def _finalize_reply(user_message: str, reply: str | None) -> str | None:
    if not reply:
        return None
    cleaned = reply.strip()
    if _looks_off_script_reply(cleaned):
        logger.warning("Fallback assistant reply rejected as off-script: %s", cleaned)
        return _safe_static_reply(user_message)
    if _is_incomplete_reply(cleaned):
        return _safe_static_reply(user_message)
    return cleaned


def _extract_openai_style_content(data: dict[str, object]) -> str | None:
    choices = data.get("choices") if isinstance(data, dict) else None
    if not isinstance(choices, list) or not choices:
        return None

    first_choice = choices[0] if isinstance(choices[0], dict) else None
    if not isinstance(first_choice, dict):
        return None

    finish_reason = str(first_choice.get("finish_reason") or "").strip().lower()
    if finish_reason and finish_reason not in {"stop", "end_turn"}:
        return None

    message = first_choice.get("message")
    if not isinstance(message, dict):
        return None

    content = str(message.get("content") or "").strip()
    return content or None


def _extract_gemini_content(response: object) -> str | None:
    candidates = getattr(response, "candidates", None)
    if isinstance(candidates, list) and candidates:
        candidate = candidates[0]
        finish_reason = getattr(candidate, "finish_reason", None)
        if finish_reason is None:
            finish_reason = getattr(candidate, "finishReason", None)

        normalized_reason = str(finish_reason or "").strip().lower()
        if normalized_reason:
            if not any(token in normalized_reason for token in {"stop", "unspecified", "1"}):
                return None

    text = getattr(response, "text", None)
    content = str(text or "").strip()
    return content or None


async def _generate_complete_reply_once(
    user_message: str,
    generate_fn: Callable[[str], Awaitable[str | None]],
) -> str | None:
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


def _iter_gemini_models(preferred_model: str | None) -> list[str]:
    seen = set()
    models: list[str] = []
    for model_name in (preferred_model, *GEMINI_MODEL_CANDIDATES):
        normalized = _normalize_gemini_model_name(model_name)
        if normalized and normalized not in seen:
            seen.add(normalized)
            models.append(normalized)
    return models


async def _generate_with_azure_openai(user_message: str, system_prompt: str) -> str | None:
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
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": _FALLBACK_TEMPERATURE,
        "max_tokens": FALLBACK_MAX_TOKENS,
    }

    try:
        async with httpx.AsyncClient(timeout=FALLBACK_HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
        data = response.json()
        return _extract_openai_style_content(data)
    except Exception as exc:
        logger.warning("Azure fallback assistant call failed: %s", exc)
        return None


async def _generate_with_openai(user_message: str, system_prompt: str) -> str | None:
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
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": _FALLBACK_TEMPERATURE,
        "max_tokens": FALLBACK_MAX_TOKENS,
    }

    try:
        async with httpx.AsyncClient(timeout=FALLBACK_HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
        data = response.json()
        return _extract_openai_style_content(data)
    except Exception as exc:
        logger.warning("OpenAI fallback assistant call failed: %s", exc)
        return None


async def _generate_with_gemini(user_message: str, system_prompt: str) -> str | None:
    if not _GENAI_AVAILABLE or not settings.gemini_api_key:
        return None

    genai.configure(api_key=settings.gemini_api_key)
    last_error = None

    for model_name in _iter_gemini_models(settings.gemini_model):
        try:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_prompt,
            )
            response = await model.generate_content_async(
                user_message,
                generation_config={
                    "temperature": _FALLBACK_TEMPERATURE,
                    "max_output_tokens": FALLBACK_MAX_TOKENS,
                },
            )
            return _extract_gemini_content(response)
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


async def _generate_and_finalize(
    user_message: str,
    generate_fn: Callable[[str], Awaitable[str | None]],
) -> str | None:
    reply = await _generate_complete_reply_once(user_message, generate_fn)
    return _finalize_reply(user_message, reply)


async def generate_fallback_reply(user_message: str, reason: str = "") -> str | None:
    message = (user_message or "").strip()
    if not message:
        return None

    system_prompt = _build_fallback_system_prompt(reason)
    provider = (settings.openai_provider or "").lower().strip()

    async def generate_with_gemini(prompt: str) -> str | None:
        return await _generate_with_gemini(prompt, system_prompt)

    async def generate_with_openai(prompt: str) -> str | None:
        return await _generate_with_openai(prompt, system_prompt)

    async def generate_with_azure(prompt: str) -> str | None:
        return await _generate_with_azure_openai(prompt, system_prompt)

    if provider == "gemini":
        reply = await _generate_and_finalize(message, generate_with_gemini)
        if reply:
            return reply
        reply = await _generate_and_finalize(message, generate_with_openai)
        if reply:
            return reply
        return await _generate_and_finalize(message, generate_with_azure)

    if provider == "azure":
        reply = await _generate_and_finalize(message, generate_with_azure)
        if reply:
            return reply
        return await _generate_and_finalize(message, generate_with_openai)

    if provider == "openai":
        reply = await _generate_and_finalize(message, generate_with_openai)
        if reply:
            return reply
        return await _generate_and_finalize(message, generate_with_azure)

    reply = await _generate_and_finalize(message, generate_with_gemini)
    if reply:
        return reply
    reply = await _generate_and_finalize(message, generate_with_azure)
    if reply:
        return reply
    return await _generate_and_finalize(message, generate_with_openai)
