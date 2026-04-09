import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


async def _get_weather_summary() -> str | None:
    """Fetch a lightweight weather summary used to make upsell copy feel timely."""
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            response = await client.get("https://wttr.in/?format=j1")
            response.raise_for_status()
        data = response.json()
        current = (data.get("current_condition") or [{}])[0]
        temp_c = current.get("temp_C")
        desc = ((current.get("weatherDesc") or [{}])[0]).get("value")
        if temp_c is None and not desc:
            return None
        if temp_c is None:
            return str(desc)
        if not desc:
            return f"{temp_c}C"
        return f"{temp_c}C and {desc}"
    except Exception:
        return None


async def _generate_with_azure_openai(prompt: str) -> str | None:
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
            {
                "role": "system",
                "content": (
                    "You write one short, friendly upsell sentence for a cafe chatbot. "
                    "Keep it under 28 words. Natural, not pushy."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 70,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("Azure OpenAI upsell copy generation failed: %s", exc)
        return None


async def _generate_with_openai(prompt: str) -> str | None:
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
            {
                "role": "system",
                "content": (
                    "You write one short, friendly upsell sentence for a cafe chatbot. "
                    "Keep it under 28 words. Natural, not pushy."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 70,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("OpenAI upsell copy generation failed: %s", exc)
        return None


async def generate_upsell_copy(anchor_item_name: str, suggested_item_name: str, fun_fact: str | None = None) -> str | None:
    weather_summary = await _get_weather_summary()
    prompt = (
        f"Customer just added '{anchor_item_name}'. Suggest '{suggested_item_name}'. "
        f"Weather now: {weather_summary or 'unknown'}. "
        f"Extra context: {fun_fact or 'no extra fact'}. "
        "Write exactly one conversational sentence and include the suggested item name."
    )

    provider = (settings.openai_provider or "").lower().strip()
    if provider == "azure":
        generated = await _generate_with_azure_openai(prompt)
        if generated:
            return generated
        return await _generate_with_openai(prompt)
    if provider == "openai":
        generated = await _generate_with_openai(prompt)
        if generated:
            return generated
        return await _generate_with_azure_openai(prompt)

    # Fallback: try Azure first, then OpenAI if provider is unspecified.
    generated = await _generate_with_azure_openai(prompt)
    if generated:
        return generated
    return await _generate_with_openai(prompt)


async def generate_casual_suggestion_copy(context_item_name: str, suggestion_names: list[str]) -> str | None:
    """Generate a friendly casual suggestion line (non-combo path), optionally weather-aware."""
    cleaned_names = [name for name in suggestion_names if name]
    if not cleaned_names:
        return None

    weather_summary = await _get_weather_summary()
    joined = ", ".join(cleaned_names[:3])
    prompt = (
        f"Customer just added '{context_item_name}'. "
        f"Suggest these items casually: {joined}. "
        f"Weather now: {weather_summary or 'unknown'}. "
        "Write exactly one short, friendly sentence under 28 words and include at least one suggested item by name."
    )

    provider = (settings.openai_provider or "").lower().strip()
    if provider == "azure":
        generated = await _generate_with_azure_openai(prompt)
        if generated:
            return generated
        return await _generate_with_openai(prompt)
    if provider == "openai":
        generated = await _generate_with_openai(prompt)
        if generated:
            return generated
        return await _generate_with_azure_openai(prompt)

    generated = await _generate_with_azure_openai(prompt)
    if generated:
        return generated
    return await _generate_with_openai(prompt)
