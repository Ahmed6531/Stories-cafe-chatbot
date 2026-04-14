import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.menu_details import extract_detail_query  # noqa: E402
from app.services.menu_details import _is_confident_availability_match  # noqa: E402
from app.services.menu_details import _normalize_item_query_alias  # noqa: E402
from app.services.menu_details import _looks_like_ice_cream_query  # noqa: E402


class MenuDetailsTypoTests(unittest.TestCase):
    def test_extract_detail_query_handles_o_u_have_typo_prefix(self) -> None:
        item_name, focus = extract_detail_query("o u have iced matcha")
        self.assertEqual(item_name, "iced matcha")
        self.assertIsNone(focus)

    def test_extract_detail_query_handles_u_have_prefix(self) -> None:
        item_name, focus = extract_detail_query("u have iced matcha")
        self.assertEqual(item_name, "iced matcha")
        self.assertIsNone(focus)

    def test_extract_detail_query_handles_what_about_prefix(self) -> None:
        item_name, focus = extract_detail_query("what about chocolate croissant")
        self.assertEqual(item_name, "chocolate croissant")
        self.assertIsNone(focus)

    def test_extract_detail_query_handles_how_about_prefix(self) -> None:
        item_name, focus = extract_detail_query("how about chocolate croissant")
        self.assertEqual(item_name, "chocolate croissant")
        self.assertIsNone(focus)

    def test_item_alias_keeps_ice_cream_literal(self) -> None:
        self.assertEqual(_normalize_item_query_alias("ice cream"), "ice cream")

    def test_detects_ice_cream_query(self) -> None:
        self.assertTrue(_looks_like_ice_cream_query("ice cream"))

    def test_detects_ice_ceam_query_typo(self) -> None:
        self.assertTrue(_looks_like_ice_cream_query("ice ceam"))

    def test_availability_confidence_accepts_cappicuno_typo(self) -> None:
        self.assertTrue(
            _is_confident_availability_match("cappicuno", {"name": "Cappuccino"})
        )

    def test_availability_confidence_rejects_matcha_to_mocha(self) -> None:
        self.assertFalse(
            _is_confident_availability_match("matcha", {"name": "Mocha"})
        )


if __name__ == "__main__":
    unittest.main()
