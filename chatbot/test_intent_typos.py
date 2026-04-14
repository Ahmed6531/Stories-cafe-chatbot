import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))


class IntentTypoTests(unittest.TestCase):
    def setUp(self) -> None:
        genai_stub = types.ModuleType("google.generativeai")
        google_stub = types.ModuleType("google")
        google_stub.generativeai = genai_stub
        self._module_patch = patch.dict(sys.modules, {"google": google_stub, "google.generativeai": genai_stub})
        self._module_patch.start()

    def tearDown(self) -> None:
        self._module_patch.stop()

    def test_lear_cart_maps_to_clear_cart(self) -> None:
        from app.services.orchestrator import detect_special_command  # noqa: E402
        self.assertEqual(detect_special_command("lear cart"), "clear_cart")

    def test_clera_my_cart_maps_to_clear_cart(self) -> None:
        from app.services.orchestrator import detect_special_command  # noqa: E402
        self.assertEqual(detect_special_command("clera my cart"), "clear_cart")


if __name__ == "__main__":
    unittest.main()
