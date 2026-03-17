def normalize_user_message(message: str) -> str:
    """
    Minimal normalization for MVP:
    - strip leading/trailing spaces
    - collapse repeated internal whitespace
    - lowercase for easier rule-based handling
    """
    normalized = " ".join(message.strip().split())
    return normalized.lower()