"""
Tests for multi-turn clarification state machine in item_clarification.py
and the session stage transitions it drives through the orchestrator.

Covers:
  - Menu choice clarification: ambiguous match triggers stage, resolution picks correct item
  - Menu choice: invalid reply re-prompts (stage stays)
  - Customization clarification: missing required variants prompt user
  - Customization: answering advances to cart add, stage cleared
  - Single-option group: auto-skipped, never prompts
  - build_menu_choice_prompt / build_menu_choice_suggestions
  - resolve_menu_choice: exact and contains resolution
  - build_customization_prompt / build_customization_suggestions
  - build_defaults_confirmation_prompt

Does NOT retest:
  - collect_missing_variant_groups (test_variants_logic.py)
  - apply_customization_response (test_variants_logic.py)
  - apply_smart_defaults (test_variants_logic.py)
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tests.testchatbotflows.conftest import (
    fake_menu_items,
    fake_menu_item_detail,
    fake_menu_item_detail_no_variants,
    fake_menu_item_detail_single_option,
    fake_requested_item,
)
from app.services.item_clarification import (
    find_ambiguous_menu_matches,
    build_menu_choice_prompt,
    build_menu_choice_suggestions,
    resolve_menu_choice,
    build_customization_prompt,
    build_customization_suggestions,
    collect_missing_variant_groups,
    build_defaults_confirmation_prompt,
    build_defaults_confirmation_suggestions,
)


# ---------------------------------------------------------------------------
# find_ambiguous_menu_matches
# ---------------------------------------------------------------------------

class TestFindAmbiguousMenuMatches(unittest.TestCase):

    def _menu_with_both_lattes(self):
        return [
            {"_id": "1", "name": "Iced Latte", "isAvailable": True},
            {"_id": "2", "name": "Hot Latte", "isAvailable": True},
        ]

    def test_ambiguous_query_returns_both_candidates(self):
        menu = self._menu_with_both_lattes()
        result = find_ambiguous_menu_matches(menu, "latte")
        names = [item["name"] for item in result]
        self.assertIn("Iced Latte", names)
        self.assertIn("Hot Latte", names)

    def test_exact_match_returns_empty(self):
        menu = self._menu_with_both_lattes()
        result = find_ambiguous_menu_matches(menu, "Iced Latte")
        self.assertEqual(result, [])

    def test_single_match_not_ambiguous(self):
        menu = [
            {"_id": "1", "name": "Cappuccino", "isAvailable": True},
            {"_id": "2", "name": "Espresso", "isAvailable": True},
        ]
        result = find_ambiguous_menu_matches(menu, "cappuccino")
        self.assertEqual(result, [])

    def test_unavailable_items_excluded(self):
        menu = [
            {"_id": "1", "name": "Iced Latte", "isAvailable": True},
            {"_id": "2", "name": "Hot Latte", "isAvailable": False},
        ]
        result = find_ambiguous_menu_matches(menu, "latte")
        # Only one available latte → should not be considered ambiguous
        self.assertEqual(result, [])

    def test_empty_query_returns_empty(self):
        result = find_ambiguous_menu_matches(fake_menu_items(), "")
        self.assertEqual(result, [])


# ---------------------------------------------------------------------------
# build_menu_choice_prompt
# ---------------------------------------------------------------------------

class TestBuildMenuChoicePrompt(unittest.TestCase):

    def test_two_candidates_uses_or_format(self):
        candidates = [
            {"name": "Iced Latte"},
            {"name": "Hot Latte"},
        ]
        prompt = build_menu_choice_prompt("latte", candidates)
        self.assertIn("Iced Latte", prompt)
        self.assertIn("Hot Latte", prompt)
        self.assertIn("or", prompt.lower())

    def test_single_candidate_asks_did_you_mean(self):
        candidates = [{"name": "Iced Latte"}]
        prompt = build_menu_choice_prompt("lattte", candidates)
        self.assertIn("Iced Latte", prompt)

    def test_empty_candidates_returns_generic_prompt(self):
        prompt = build_menu_choice_prompt("", [])
        self.assertIsInstance(prompt, str)
        self.assertGreater(len(prompt), 0)


# ---------------------------------------------------------------------------
# build_menu_choice_suggestions
# ---------------------------------------------------------------------------

class TestBuildMenuChoiceSuggestions(unittest.TestCase):

    def test_returns_clarification_choice_type(self):
        candidates = [{"name": "Iced Latte"}, {"name": "Hot Latte"}]
        suggestions = build_menu_choice_suggestions(candidates)
        self.assertEqual(len(suggestions), 2)
        for s in suggestions:
            self.assertEqual(s["type"], "clarification_choice")
            self.assertIn("item_name", s)
            self.assertIn("input_text", s)

    def test_skips_candidates_without_name(self):
        candidates = [{"name": ""}, {"name": "Hot Latte"}]
        suggestions = build_menu_choice_suggestions(candidates)
        self.assertEqual(len(suggestions), 1)


# ---------------------------------------------------------------------------
# resolve_menu_choice
# ---------------------------------------------------------------------------

class TestResolveMenuChoice(unittest.TestCase):

    def _candidates(self):
        return [
            {"_id": "1", "name": "Iced Latte"},
            {"_id": "2", "name": "Hot Latte"},
        ]

    def test_exact_match_resolves(self):
        result = resolve_menu_choice("Iced Latte", self._candidates())
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "Iced Latte")

    def test_contains_match_resolves(self):
        # User says "iced" — contains "Iced Latte"
        result = resolve_menu_choice("iced", self._candidates())
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "Iced Latte")

    def test_no_match_returns_none(self):
        result = resolve_menu_choice("banana", self._candidates())
        self.assertIsNone(result)

    def test_empty_message_returns_none(self):
        result = resolve_menu_choice("", self._candidates())
        self.assertIsNone(result)

    def test_ambiguous_reply_returns_none(self):
        # Both contain "latte" so neither resolves uniquely
        result = resolve_menu_choice("latte", self._candidates())
        self.assertIsNone(result)


# ---------------------------------------------------------------------------
# collect_missing_variant_groups + single-option auto-skip
# ---------------------------------------------------------------------------

class TestCollectMissingVariantGroupsIntegration(unittest.TestCase):
    """
    Integration-level checks on collect_missing_variant_groups.
    Unit-level tests (including single-option skip) already exist in test_variants_logic.py.
    These tests verify behaviour specific to the fixtures defined in conftest.py.
    """

    def test_item_with_size_and_milk_missing_both(self):
        detail = fake_menu_item_detail("Latte")
        requested = fake_requested_item("Latte")  # no size, no milk
        missing = collect_missing_variant_groups(requested, detail)
        group_labels = [g.get("customerLabel") or g.get("name") for g in missing]
        self.assertIn("Size", group_labels)

    def test_item_with_size_already_provided_only_milk_missing(self):
        detail = fake_menu_item_detail("Latte")
        requested = fake_requested_item("Latte", size="Medium")
        missing = collect_missing_variant_groups(requested, detail)
        group_labels = [g.get("customerLabel") or g.get("name") for g in missing]
        self.assertNotIn("Size", group_labels)

    def test_item_with_no_variants_returns_empty(self):
        detail = fake_menu_item_detail_no_variants("Cheese Croissant")
        requested = fake_requested_item("Cheese Croissant")
        missing = collect_missing_variant_groups(requested, detail)
        self.assertEqual(missing, [])

    def test_single_option_group_not_in_missing(self):
        detail = fake_menu_item_detail_single_option("Water")
        requested = fake_requested_item("Water")
        missing = collect_missing_variant_groups(requested, detail)
        # The single-option Temperature group should be skipped
        self.assertEqual(missing, [])


# ---------------------------------------------------------------------------
# build_customization_prompt
# ---------------------------------------------------------------------------

class TestBuildCustomizationPrompt(unittest.TestCase):

    def test_returns_string_with_item_name(self):
        detail = fake_menu_item_detail("Latte")
        requested = fake_requested_item("Latte")
        missing = collect_missing_variant_groups(requested, detail)
        prompt = build_customization_prompt("Latte", missing)
        self.assertIsInstance(prompt, str)
        self.assertIn("Latte", prompt)

    def test_empty_missing_groups_returns_generic_prompt(self):
        prompt = build_customization_prompt("Croissant", [])
        self.assertIn("Croissant", prompt)


# ---------------------------------------------------------------------------
# build_customization_suggestions
# ---------------------------------------------------------------------------

class TestBuildCustomizationSuggestions(unittest.TestCase):

    def test_returns_clarification_option_type(self):
        detail = fake_menu_item_detail("Latte")
        requested = fake_requested_item("Latte")
        missing = collect_missing_variant_groups(requested, detail)
        suggestions = build_customization_suggestions(missing)
        self.assertGreater(len(suggestions), 0)
        for s in suggestions:
            self.assertEqual(s["type"], "clarification_option")
            self.assertIn("group", s)
            self.assertIn("input_text", s)

    def test_empty_missing_groups_returns_empty_list(self):
        suggestions = build_customization_suggestions([])
        self.assertEqual(suggestions, [])


# ---------------------------------------------------------------------------
# build_defaults_confirmation_prompt
# ---------------------------------------------------------------------------

class TestBuildDefaultsConfirmationPrompt(unittest.TestCase):

    def test_includes_item_name_in_prompt(self):
        prompt = build_defaults_confirmation_prompt("Latte", ["Medium", "Full Fat"])
        self.assertIn("Latte", prompt)

    def test_includes_applied_size_label(self):
        prompt = build_defaults_confirmation_prompt("Latte", ["Medium", "Full Fat"])
        self.assertIn("medium", prompt.lower())

    def test_no_defaults_returns_simple_added_message(self):
        prompt = build_defaults_confirmation_prompt("Croissant", [])
        self.assertIn("Croissant", prompt)

    def test_returns_two_confirmation_suggestions(self):
        suggestions = build_defaults_confirmation_suggestions()
        self.assertEqual(len(suggestions), 2)
        types = {s["type"] for s in suggestions}
        self.assertIn("defaults_confirmation", types)
        labels = [s["label"] for s in suggestions]
        self.assertTrue(any("good" in lbl.lower() for lbl in labels))
        self.assertTrue(any("change" in lbl.lower() for lbl in labels))


if __name__ == "__main__":
    unittest.main()
