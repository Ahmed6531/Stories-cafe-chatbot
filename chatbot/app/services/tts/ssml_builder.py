import re
from html import unescape
from xml.sax.saxutils import escape


BREAK_TAG = '<break time="300ms"/>'
DECIMAL_PLACEHOLDER = "_DECIMAL_DOT_"
LIRA_PLACEHOLDER = "_LIRA_DOTS_"
LIRA_PATTERN = re.compile(r"\bL\.L\b")
CURRENCY_PATTERN = re.compile(r"\$\d[\d,]*(?:\.\d{1,2})?")
ORDINAL_PATTERN = re.compile(r"\b(\d+)(st|nd|rd|th)\b", re.IGNORECASE)
ITEM_PATTERN = re.compile(
    r"\b(added|removed|updated)\b\s+(?:\d+\s+)?(?:an?\s+|the\s+)?(?P<item>.*?)(?=\s+(?:to|from|in|on|with|for)\b|[.!?,]|$)",
    re.IGNORECASE,
)


def strip_ssml(ssml: str) -> str:
    """Strip SSML tags for logging/display — returns plain text."""
    if not ssml:
        return ""
    text = re.sub(r"<break[^>]+/>", " ", ssml)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def build_ssml(text: str) -> str:
    """
    Convert plain reply text to SSML for Google TTS.
    Returns a valid <speak>...</speak> SSML string.
    """
    cleaned = (text or "").strip()
    if not cleaned:
        return "<speak></speak>"

    sentences = _split_sentences(cleaned)
    if not sentences:
        return f"<speak>{escape(cleaned)}</speak>"

    chunks: list[str] = []
    for index, sentence in enumerate(sentences):
        sentence_ssml = _build_sentence_ssml(sentence)
        if index == len(sentences) - 1 and sentence.rstrip().endswith("?"):
            sentence_ssml = f'<prosody rate="medium" pitch="+1st">{sentence_ssml}</prosody>'
        chunks.append(sentence_ssml)

    return f"<speak>{BREAK_TAG.join(chunks)}</speak>"


def _split_sentences(text: str) -> list[str]:
    protected = re.sub(r"(?<=\d)\.(?=\d)", DECIMAL_PLACEHOLDER, text)
    protected = protected.replace("L.L", LIRA_PLACEHOLDER)
    parts = re.findall(r"[^.!?]+[.!?]*", protected, flags=re.MULTILINE)
    restored = [
        part.replace(DECIMAL_PLACEHOLDER, ".").replace(LIRA_PLACEHOLDER, "L.L").strip()
        for part in parts
        if part and part.strip()
    ]
    return restored


def _build_sentence_ssml(sentence: str) -> str:
    emphasis_span = _find_item_span(sentence)
    parts: list[str] = []
    cursor = 0

    while cursor < len(sentence):
        if emphasis_span and cursor == emphasis_span[0]:
            item_text = sentence[emphasis_span[0]:emphasis_span[1]].strip()
            if item_text:
                parts.append(f'<emphasis level="moderate">{escape(item_text)}</emphasis>')
            cursor = emphasis_span[1]
            continue

        next_match = _find_next_special_match(sentence, cursor, emphasis_span)
        next_emphasis_start = emphasis_span[0] if emphasis_span and emphasis_span[0] >= cursor else None

        if next_match is None and next_emphasis_start is None:
            parts.append(escape(sentence[cursor:]))
            break

        if next_emphasis_start is not None and (
            next_match is None or next_emphasis_start < next_match[0]
        ):
            if next_emphasis_start > cursor:
                parts.append(escape(sentence[cursor:next_emphasis_start]))
            cursor = next_emphasis_start
            continue

        start, end, replacement = next_match
        if start > cursor:
            parts.append(escape(sentence[cursor:start]))
        parts.append(replacement)
        cursor = end

    return "".join(parts)


def _find_item_span(sentence: str) -> tuple[int, int] | None:
    match = ITEM_PATTERN.search(sentence)
    if not match:
        return None

    item = (match.group("item") or "").strip()
    if not item:
        return None

    if len(item.split()) > 8:
        return None

    return match.start("item"), match.end("item")


def _find_next_special_match(
    sentence: str,
    cursor: int,
    emphasis_span: tuple[int, int] | None,
) -> tuple[int, int, str] | None:
    matches: list[tuple[int, int, str]] = []

    for pattern, builder in (
        (CURRENCY_PATTERN, _currency_replacement),
        (LIRA_PATTERN, _lira_replacement),
        (ORDINAL_PATTERN, _ordinal_replacement),
    ):
        match = pattern.search(sentence, cursor)
        if not match:
            continue
        if emphasis_span and match.start() >= emphasis_span[0] and match.end() <= emphasis_span[1]:
            continue
        matches.append((match.start(), match.end(), builder(match)))

    if not matches:
        return None

    return min(matches, key=lambda item: item[0])


def _currency_replacement(match: re.Match[str]) -> str:
    value = escape(match.group(0))
    return f'<say-as interpret-as="currency" language="en-US">{value}</say-as>'


def _lira_replacement(match: re.Match[str]) -> str:
    return '<sub alias="Lebanese Lira">L.L</sub>'


def _ordinal_replacement(match: re.Match[str]) -> str:
    number = escape(match.group(1))
    return f'<say-as interpret-as="ordinal">{number}</say-as>'