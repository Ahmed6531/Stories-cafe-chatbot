import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.utils.log_redaction import redact


class TestLogRedaction(unittest.TestCase):
    def test_redacts_phone_number(self):
        self.assertEqual(
            redact("call me at 555-123-4567"),
            "call me at [REDACTED]",
        )

    def test_redacts_name_phrase(self):
        self.assertEqual(
            redact("my name is Sarah and i am happy"),
            "my name is [REDACTED] and i am [REDACTED]",
        )

    def test_redacts_dict_message_and_instructions(self):
        value = {
            "message": "call me Mike",
            "instructions": "my name is Sarah",
            "other": "leave unchanged",
        }
        self.assertEqual(
            redact(value),
            {
                "message": "call me [REDACTED]",
                "instructions": "my name is [REDACTED]",
                "other": "leave unchanged",
            },
        )

    def test_value_without_pii_passes_through(self):
        self.assertEqual(redact("add one latte"), "add one latte")

    def test_none_returns_none(self):
        self.assertIsNone(redact(None))
