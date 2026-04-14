import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.fallback_assistant import (  # noqa: E402
    _extract_openai_style_content,
    _extract_gemini_content,
    _is_incomplete_reply,
)


class _FakeGeminiCandidate:
    def __init__(self, finish_reason):
        self.finish_reason = finish_reason


class _FakeGeminiResponse:
    def __init__(self, text, finish_reason):
        self.text = text
        self.candidates = [_FakeGeminiCandidate(finish_reason)]


class FallbackAssistantTests(unittest.TestCase):
    def test_detects_clipped_other_ending(self) -> None:
        text = "Yes, we do! You can find it listed on our menu along with our other"
        self.assertTrue(_is_incomplete_reply(text))

    def test_accepts_complete_sentence(self) -> None:
        text = "Yes, we do. You can find it on our menu."
        self.assertFalse(_is_incomplete_reply(text))

    def test_rejects_non_stop_finish_reason(self) -> None:
        data = {
            "choices": [
                {
                    "finish_reason": "length",
                    "message": {"content": "This reply was cut off"},
                }
            ]
        }
        self.assertIsNone(_extract_openai_style_content(data))

    def test_accepts_stop_finish_reason(self) -> None:
        data = {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {"content": "Complete reply."},
                }
            ]
        }
        self.assertEqual(_extract_openai_style_content(data), "Complete reply.")

    def test_rejects_gemini_max_tokens_finish_reason(self) -> None:
        response = _FakeGeminiResponse("Cut off reply", "MAX_TOKENS")
        self.assertIsNone(_extract_gemini_content(response))

    def test_accepts_gemini_stop_finish_reason(self) -> None:
        response = _FakeGeminiResponse("Complete reply.", "STOP")
        self.assertEqual(_extract_gemini_content(response), "Complete reply.")


if __name__ == "__main__":
    unittest.main()
