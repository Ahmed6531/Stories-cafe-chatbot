import json
import os
import re
from difflib import SequenceMatcher, get_close_matches


# ---------------------------------------------------------------------------
# Menu vocabulary (built once at import time from the seed file)
# ---------------------------------------------------------------------------

def _normalize_lookup_token(token: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(token or "").lower())


def _build_menu_vocab() -> tuple[set[str], set[str]]:
    """
    Load every meaningful token from the menu seed so autocorrect knows all
    valid item names, categories, and subcategories.
    """
    seed_path = os.path.join(
        os.path.dirname(__file__),
        "..", "..", "..", "..",
        "backend", "src", "seed", "menu.seed.json",
    )
    seed_path = os.path.normpath(seed_path)

    vocab: set[str] = set()
    phrases: set[str] = set()
    try:
        with open(seed_path, "r", encoding="utf-8") as f:
            items = json.load(f)
        for item in items:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").lower().strip()
            if len(name) >= 4:
                phrases.add(name)
            for field in ("name", "category", "subcategory"):
                value = item.get(field) or ""
                for token in value.lower().split():
                    clean = _normalize_lookup_token(token)
                    if len(clean) >= 3:
                        vocab.add(clean)
    except Exception:
        pass

    return vocab, phrases


_MENU_VOCAB, _MENU_PHRASES = _build_menu_vocab()

# Extra non-menu words so command-style typos can still be corrected.
_EXTRA_VOCAB: set[str] = {
    "clear", "cart", "empty", "reset", "delete", "remove",
    "checkout", "check", "out", "order", "pay", "confirm",
    "cancel", "nevermind", "recommend", "suggest", "describe",
    "available", "because", "please", "thanks",
}

# High-confidence typo replacements applied before fuzzy matching.
_FORCE_CORRECTIONS: dict[str, str] = {
    "cler": "clear",
    "clera": "clear",
    "cleer": "clear",
    "lear": "clear",
    "crt": "cart",
    "criossant": "croissant",
    "croisant": "croissant",
    "crossant": "croissant",
    "yougurt": "yogurt",
    "nevermimd": "nevermind",
    "neverminf": "nevermind",
    "nevrmind": "nevermind",
    "becuase": "because",
    "reccomend": "recommend",
    "sugget": "suggest",
}

# Tokens that should never be autocorrected.
_STOP_TOKENS: set[str] = {
    "the", "and", "for", "can", "you", "add", "get", "please", "want",
    "like", "have", "give", "some", "with", "this", "that", "how",
    "are", "was", "its", "not", "but", "yes", "yep", "nah", "now",
    "hey", "hi", "ok", "okay", "sir", "two", "one", "my", "me",
    "us", "do", "an", "to", "i", "a",
}


def _autocorrect_token(token: str, vocab: set[str]) -> str:
    """
    Return the closest menu vocab word for a token that looks like a typo,
    otherwise return the token unchanged.
    """
    cleaned = _normalize_lookup_token(token)
    if cleaned in _FORCE_CORRECTIONS:
        return _FORCE_CORRECTIONS[cleaned]

    if cleaned in _STOP_TOKENS or cleaned in vocab or len(cleaned) < 4:
        return token

    cutoff = 0.86 if len(cleaned) <= 4 else 0.82 if len(cleaned) <= 6 else 0.76
    matches = get_close_matches(cleaned, vocab, n=1, cutoff=cutoff)
    if matches:
        candidate = matches[0]
        if SequenceMatcher(None, cleaned, candidate).ratio() >= cutoff:
            return candidate
    return token


def _autocorrect_phrase(message: str) -> str:
    normalized = " ".join(str(message or "").lower().split())
    if normalized in _MENU_PHRASES or not _MENU_PHRASES:
        return normalized

    cutoff = 0.84 if len(normalized.split()) <= 2 else 0.80
    matches = get_close_matches(normalized, _MENU_PHRASES, n=1, cutoff=cutoff)
    if matches:
        candidate = matches[0]
        phrase_ratio = SequenceMatcher(None, normalized, candidate).ratio()
        if phrase_ratio < cutoff:
            return normalized

        src_tokens = normalized.split()
        dst_tokens = candidate.split()
        if len(src_tokens) == len(dst_tokens):
            # Only allow typo-like token substitutions. This prevents semantic
            # replacements such as "matcha" -> "mocha" while still allowing
            # close misspellings.
            for src, dst in zip(src_tokens, dst_tokens):
                if src == dst:
                    continue
                if SequenceMatcher(None, src, dst).ratio() < 0.88:
                    return normalized
            return candidate
    return normalized


def autocorrect_message(message: str) -> str:
    """
    Correct likely menu-word typos in a raw user message without touching
    words that are already correct or are common chat filler.
    """
    vocab = _MENU_VOCAB | _EXTRA_VOCAB
    if not vocab:
        return message

    normalized = " ".join(str(message or "").split())
    phrase_corrected = _autocorrect_phrase(normalized)
    tokens = phrase_corrected.split()
    corrected = [_autocorrect_token(token, vocab) for token in tokens]
    return " ".join(corrected)


# ---------------------------------------------------------------------------
# Public normalizer
# ---------------------------------------------------------------------------

def normalize_user_message(message: str) -> str:
    """
    Normalisation pipeline:
    1. Strip / collapse whitespace
    2. Lowercase
    3. Autocorrect likely menu-word typos against the known menu vocabulary
    """
    normalized = " ".join(message.strip().split()).lower()
    normalized = autocorrect_message(normalized)
    return normalized
