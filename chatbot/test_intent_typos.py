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

    def test_lear_cart_normalizes_to_clear_cart(self) -> None:
        """'lear cart' is a typo — normalize_user_message must fix it to 'clear cart',
        which _layer2_deterministic then routes to clear_cart."""
        from app.utils.normalize import normalize_user_message  # noqa: E402
        self.assertEqual(normalize_user_message("lear cart"), "clear cart")

    def test_clera_my_cart_normalizes_correctly(self) -> None:
        """'clera my cart' is a typo — normalizer should return a clear-cart phrase."""
        from app.utils.normalize import normalize_user_message  # noqa: E402
        result = normalize_user_message("clera my cart")
        self.assertIn("clear", result)
        self.assertIn("cart", result)


if __name__ == "__main__":
    unittest.main()
