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

_FALLBACK_TEMPERATURE = 0.2

_FALLBACK_BASE_PROMPT = (
    "You are the friendly barista and assistant at Stories Cafe. "
    "You can help with menu questions, café info, opening hours, and general help. "
    "Reply in a warm, concise way using complete sentences. "
    "You must NEVER fabricate cart actions or pretend to add, remove, or modify items. "
    "Never invent menu items, prices, or order status. "
    "Always end uncertain replies with a question that moves the conversation forward."
)

_FALLBACK_REASON_HINTS: dict[str, str] = {
    "bare_affirmation_needs_context": (
        " The user sent a bare yes/ok/sure with no clear context. "
        "Ask them what they meant — for example: "
        "'Just to confirm — did you want to checkout, or is there something else I can help with?'"
    ),
    "entity_not_found": (
        " The item the user mentioned wasn't found on the menu. "
        "Acknowledge this politely and ask them to clarify or suggest they browse the menu."
    ),
    "low_confidence": (
        " The request was unclear. "
        "Gently ask the user to rephrase what they'd like to do."
    ),
    "unknown_intent": (
        " The request is unclear or off-topic. "
        "Offer a helpful redirect. Never say 'I don't understand' — "
        "always suggest something the user can do (browse menu, add items, checkout)."
    ),
    "llm_parse_failed": (
        " There was a technical issue parsing the request. "
        "Apologise briefly and ask the user to try again."
    ),
    "repeat_order_no_history": (
        " The user wants to repeat a previous order but no history is available in this session. "
        "Let them know and invite them to place a fresh order."
    ),
}

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

_FALLBACK_REASON_HINTS["unknown_intent"] = (
    " The customer said something unclear or unexpected. "
    "Do not say 'Welcome' - they are already in a conversation. "
    "Respond as if you didn't quite catch what they meant: "
    "ask them what they'd like to order or how you can help. "
    "Keep it to one or two sentences."
)
_FALLBACK_REASON_HINTS["bare_affirmation_needs_context"] = (
    " The customer said yes/ok/sure with no clear context. "
    "Ask what they meant - for example: "
    "'Just to confirm - did you want to checkout, or is there something else I can help with?'"
)


def _build_fallback_system_prompt(reason: str) -> str:
    hint = _FALLBACK_REASON_HINTS.get(reason, "")
    return _FALLBACK_BASE_PROMPT + hint


# Legacy constant kept for any external code that references it directly.
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


def _normalize_gemini_model_name(model_name: str | None) -> str:
    normalized = (model_name or "").strip()
    if normalized.startswith("models/"):
        return normalized.split("/", 1)[1]
    return normalized


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


async def _generate_with_gemini(user_message: str, system_prompt: str) -> str | None:
    if not _GENAI_AVAILABLE or not settings.gemini_api_key:
        return None

    genai.configure(api_key=settings.gemini_api_key)
    model_name = _normalize_gemini_model_name(settings.gemini_model)
    if not model_name:
        logger.warning("Gemini fallback assistant missing configured model name")
        return None

    try:
        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system_prompt,
        )
        response = await model.generate_content_async(
            user_message,
            generation_config={"temperature": _FALLBACK_TEMPERATURE, "max_output_tokens": 220},
        )
        content = response.text.strip() if response.text else None
        return content if content else None
    except Exception as exc:
        logger.warning("Gemini fallback assistant call failed for model %s: %s", model_name, exc)
        return None


async def generate_fallback_reply(user_message: str, reason: str = "") -> str | None:
    """
    Generate a context-aware fallback reply.

    Args:
        user_message: The user's message.
        reason:       The reason string from the intent pipeline (e.g.
                      "bare_affirmation_needs_context", "low_confidence",
                      "unknown_intent", "entity_not_found").  Used to build a
                      contextual system prompt so the fallback reply is helpful
                      rather than generic.
    """
    message = (user_message or "").strip()
    if not message:
        return None

    system_prompt = _build_fallback_system_prompt(reason)
    provider = (settings.openai_provider or "").lower().strip()

    if provider == "gemini":
        reply = await _generate_with_gemini(message, system_prompt)
        if reply:
            return _finalize_reply(message, reply)
        reply = await _generate_with_openai(message, system_prompt)
        if reply:
            return _finalize_reply(message, reply)
        return _finalize_reply(message, await _generate_with_azure_openai(message, system_prompt))

    if provider == "azure":
        reply = await _generate_with_azure_openai(message, system_prompt)
        if reply:
            return _finalize_reply(message, reply)
        return _finalize_reply(message, await _generate_with_openai(message, system_prompt))

    if provider == "openai":
        reply = await _generate_with_openai(message, system_prompt)
        if reply:
            return _finalize_reply(message, reply)
        return _finalize_reply(message, await _generate_with_azure_openai(message, system_prompt))

    # Unknown provider — try all in order
    reply = await _generate_with_gemini(message, system_prompt)
    if reply:
        return _finalize_reply(message, reply)
    reply = await _generate_with_azure_openai(message, system_prompt)
    if reply:
        return _finalize_reply(message, reply)
    return _finalize_reply(message, await _generate_with_openai(message, system_prompt))
