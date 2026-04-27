import re
from typing import Any


_PHONE_RE = re.compile(r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b")
_NAME_RE = re.compile(r"\b(my name is|i am|call me)(?!\s+at\b)\s+\S+", re.IGNORECASE)
_REDACT_KEYS = {"message", "raw_text", "instructions", "notes"}


def _redact_string(value: str) -> str:
    redacted = _PHONE_RE.sub("[REDACTED]", value)
    redacted = _NAME_RE.sub(lambda match: f"{match.group(1)} [REDACTED]", redacted)
    return redacted


def redact(value: str | dict | None) -> str | dict | None:
    """
    Redact PII from a log value before emission.

    For strings: replace phone number patterns and anything after
    "my name is" / "i am" / "call me" with [REDACTED].

    For dicts: redact the values of keys named "message", "raw_text",
    "instructions", "notes" recursively.

    Returns the redacted value. Never raises.
    """
    try:
        if value is None:
            return None
        if isinstance(value, str):
            return _redact_string(value)
        if isinstance(value, dict):
            redacted_dict: dict[str, Any] = {}
            for key, item in value.items():
                if key in _REDACT_KEYS:
                    redacted_dict[key] = redact(item)
                elif isinstance(item, dict):
                    redacted_dict[key] = redact(item)
                elif isinstance(item, list):
                    redacted_dict[key] = [
                        redact(entry) if isinstance(entry, (str, dict)) else entry
                        for entry in item
                    ]
                else:
                    redacted_dict[key] = item
            return redacted_dict
        if isinstance(value, list):
            return [
                redact(entry) if isinstance(entry, (str, dict)) else entry
                for entry in value
            ]
        return value
    except Exception:
        return value
