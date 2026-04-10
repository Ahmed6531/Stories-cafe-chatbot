import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.fallback_assistant import _build_fallback_system_prompt
from app.services.orchestrator import map_requested_item_to_selected_options, process_chat_message
from app.services.session_store import (
    get_guided_order_phase,
    get_session,
    sessions,
    set_guided_order_groups,
    set_guided_order_item_id,
    set_guided_order_item_name,
    set_guided_order_optional_groups,
    set_guided_order_phase,
    set_guided_order_quantity,
    set_guided_order_required_groups,
    set_guided_order_selections,
    set_guided_order_step,
    set_session_stage,
)


def build_latte_menu_detail() -> dict:
    return {
        "id": 8,
        "name": "Latte",
        "variants": [
            {
                "name": "Choose Size",
                "isRequired": True,
                "maxSelections": 1,
                "options": [
                    {"name": "Small", "isActive": True},
                    {"name": "Medium", "isActive": True},
                    {"name": "Large", "isActive": True},
                ],
            },
            {
                "name": "Milk",
                "isRequired": True,
                "maxSelections": 1,
                "options": [
                    {"name": "Whole Milk", "isActive": True},
                    {"name": "Oat Milk", "isActive": True},
                    {"name": "Almond Milk", "isActive": True},
                ],
            },
            {
                "name": "Extras",
                "isRequired": False,
                "maxSelections": 2,
                "options": [
                    {"name": "Extra Shot", "isActive": True},
                    {"name": "Vanilla Syrup", "isActive": True},
                ],
            },
            {
                "name": "Temperature",
                "isRequired": False,
                "maxSelections": 1,
                "options": [
                    {"name": "Extra Hot", "isActive": True},
                    {"name": "Light Ice", "isActive": True},
                ],
            },
        ],
    }


def build_croissant_menu_detail() -> dict:
    return {
        "id": 12,
        "name": "Croissant",
        "variants": [
            {
                "name": "Warming",
                "isRequired": False,
                "maxSelections": 1,
                "options": [
                    {"name": "Warm", "isActive": True},
                    {"name": "No Warming", "isActive": True},
                ],
            }
        ],
    }


def build_seed_like_mocha_menu_detail() -> dict:
    return {
        "id": 11,
        "name": "Mocha",
        "variants": [
            {
                "name": "Choose Size",
                "isRequired": True,
                "maxSelections": 1,
                "options": [
                    {"name": "Small", "isActive": True},
                    {"name": "Medium", "isActive": True},
                ],
            },
            {
                "name": "Espresso Options",
                "isRequired": False,
                "maxSelections": 1,
                "options": [
                    {"name": "Shot Decaffe", "isActive": True},
                    {"name": "Add Shot", "isActive": True},
                    {"name": "Yirgacheffe Shot", "isActive": True},
                ],
            },
            {
                "name": "Milk",
                "isRequired": False,
                "maxSelections": 1,
                "options": [
                    {"name": "Full Fat", "isActive": False},
                    {"name": "Skim Milk", "isActive": False},
                    {"name": "Almond Milk Medium", "isActive": False},
                ],
            },
            {
                "name": "Add-ons",
                "isRequired": False,
                "maxSelections": 3,
                "options": [
                    {"name": "Caramel", "isActive": False},
                    {"name": "Vanilla", "isActive": False},
                    {"name": "Hazelnut", "isActive": False},
                ],
            },
        ],
    }


def resolved_add_items(item_name: str, *, quantity: int = 1, size=None, milk=None, addons=None, instructions="") -> dict:
    return {
        "intent": "add_items",
        "items": [
            {
                "item_name": item_name,
                "quantity": quantity,
                "size": size,
                "options": {"milk": milk, "sugar": None},
                "addons": addons or [],
                "instructions": instructions,
            }
        ],
        "confidence": 0.95,
        "fallback_needed": False,
        "route_to_fallback": False,
        "reason": "",
    }


def resolved_guided_response() -> dict:
    return {
        "intent": "guided_order_response",
        "items": [],
        "confidence": 0.95,
        "fallback_needed": False,
        "route_to_fallback": False,
        "reason": "",
    }


class VariantMappingTests(unittest.TestCase):
    def setUp(self) -> None:
        sessions.clear()

    def test_instruction_fragment_maps_to_variant_option(self) -> None:
        requested_item = {
            "item_name": "croissant",
            "quantity": 1,
            "size": None,
            "options": {"milk": None, "sugar": None},
            "addons": [],
            "instructions": "no warming",
        }

        selected_options, instructions, unmatched = map_requested_item_to_selected_options(
            requested_item,
            build_croissant_menu_detail(),
        )

        self.assertEqual(selected_options, [{"optionName": "No Warming"}])
        self.assertEqual(instructions, "")
        self.assertEqual(unmatched, [])

    def test_instruction_token_overlap_matches_variant(self) -> None:
        requested_item = {
            "item_name": "croissant",
            "quantity": 1,
            "size": None,
            "options": {"milk": None, "sugar": None},
            "addons": [],
            "instructions": "not warmed up",
        }

        selected_options, instructions, unmatched = map_requested_item_to_selected_options(
            requested_item,
            build_croissant_menu_detail(),
        )

        self.assertEqual(selected_options, [{"optionName": "No Warming"}])
        self.assertEqual(instructions, "")
        self.assertEqual(unmatched, [])

    def test_unmatched_modifier_keeps_instruction_and_returns_suggestion(self) -> None:
        requested_item = {
            "item_name": "latte",
            "quantity": 1,
            "size": None,
            "options": {"milk": "almond please", "sugar": None},
            "addons": [],
            "instructions": "",
        }

        selected_options, instructions, unmatched = map_requested_item_to_selected_options(
            requested_item,
            build_latte_menu_detail(),
        )

        self.assertEqual(selected_options, [])
        self.assertIn("almond please", instructions)
        self.assertEqual(
            unmatched,
            [{"fragment": "almond please", "suggestion": "Almond Milk"}],
        )


class GuidedOrderingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        sessions.clear()

    async def test_guided_order_full_flow_asks_required_then_finalizes(self) -> None:
        session = get_session("guided-session")
        matched_item = {"id": 8, "name": "Latte", "category": "Coffee"}
        add_result = {"cart_id": "cart123", "cart": [{"name": "Latte", "qty": 1}]}

        with patch(
            "app.services.orchestrator.resolve_intent",
            new=AsyncMock(
                side_effect=[
                    resolved_add_items("latte"),
                    resolved_guided_response(),
                    resolved_guided_response(),
                    resolved_guided_response(),
                    resolved_guided_response(),
                ]
            ),
        ), patch(
            "app.services.tools.fetch_menu_items",
            new=AsyncMock(return_value=[matched_item]),
        ), patch(
            "app.services.tools.find_menu_item_by_name",
            new=AsyncMock(return_value=matched_item),
        ), patch(
            "app.services.tools.fetch_menu_item_detail",
            new=AsyncMock(return_value=build_latte_menu_detail()),
        ), patch(
            "app.services.tools.add_item_to_cart",
            new=AsyncMock(return_value=add_result),
        ) as add_to_cart_mock, patch(
            "app.services.tools.fetch_featured_items",
            new=AsyncMock(return_value=[]),
        ), patch(
            "app.services.suggestions.suggest_popular_items",
            return_value=[],
        ), patch(
            "app.services.suggestions.suggest_complementary_items",
            return_value=[],
        ):
            start_response = await process_chat_message(
                session_id=session["session_id"],
                message="i want a latte",
                cart_id=None,
                session=session,
            )
            self.assertEqual(start_response.metadata["pipeline_stage"], "guided_ordering_start")
            self.assertIn("What choose size", start_response.reply)

            size_response = await process_chat_message(
                session_id=session["session_id"],
                message="medium",
                cart_id=None,
                session=session,
            )
            self.assertIn("What milk would you like", size_response.reply)

            milk_response = await process_chat_message(
                session_id=session["session_id"],
                message="oat milk",
                cart_id=None,
                session=session,
            )
            self.assertEqual(milk_response.metadata["pipeline_stage"], "guided_ordering_review")
            self.assertEqual(get_guided_order_phase(session["session_id"]), 2)

            review_response = await process_chat_message(
                session_id=session["session_id"],
                message="done",
                cart_id=None,
                session=session,
            )
            self.assertEqual(review_response.metadata["pipeline_stage"], "guided_ordering_instructions")

            final_response = await process_chat_message(
                session_id=session["session_id"],
                message="none",
                cart_id=None,
                session=session,
            )

        self.assertTrue(final_response.cart_updated)
        self.assertEqual(final_response.metadata["pipeline_stage"], "guided_ordering_done")
        self.assertIn("Added 1x Latte", final_response.reply)
        call_kwargs = add_to_cart_mock.await_args.kwargs
        self.assertEqual(
            call_kwargs["selected_options"],
            [{"optionName": "Medium"}, {"optionName": "Oat Milk"}],
        )
        self.assertEqual(call_kwargs["instructions"], "")

    async def test_guided_order_uses_all_options_when_group_has_no_active_entries(self) -> None:
        session = get_session("guided-mocha-inactive")
        matched_item = {"id": 11, "name": "Mocha", "category": "Coffee"}

        with patch(
            "app.services.orchestrator.resolve_intent",
            new=AsyncMock(
                side_effect=[
                    resolved_add_items("mocha"),
                    resolved_guided_response(),
                    resolved_guided_response(),
                ]
            ),
        ), patch(
            "app.services.tools.fetch_menu_items",
            new=AsyncMock(return_value=[matched_item]),
        ), patch(
            "app.services.tools.find_menu_item_by_name",
            new=AsyncMock(return_value=matched_item),
        ), patch(
            "app.services.tools.fetch_menu_item_detail",
            new=AsyncMock(return_value=build_seed_like_mocha_menu_detail()),
        ), patch(
            "app.services.tools.fetch_featured_items",
            new=AsyncMock(return_value=[]),
        ), patch(
            "app.services.suggestions.suggest_popular_items",
            return_value=[],
        ), patch(
            "app.services.suggestions.suggest_complementary_items",
            return_value=[],
        ):
            start_response = await process_chat_message(
                session_id=session["session_id"],
                message="lets do another mocha",
                cart_id=None,
                session=session,
            )
            self.assertEqual(start_response.metadata["pipeline_stage"], "guided_ordering_start")

            size_response = await process_chat_message(
                session_id=session["session_id"],
                message="medium",
                cart_id=None,
                session=session,
            )
            self.assertIn("What milk would you like", size_response.reply)
            self.assertIn("Full Fat", size_response.reply)
            self.assertIn("Skim Milk", size_response.reply)

            review_response = await process_chat_message(
                session_id=session["session_id"],
                message="full fat",
                cart_id=None,
                session=session,
            )
            self.assertEqual(review_response.metadata["pipeline_stage"], "guided_ordering_review")
            self.assertIn("Espresso Options", review_response.reply)
            self.assertIn("Add-ons", review_response.reply)

    async def test_guided_order_single_optional_group_goes_directly_to_instructions(self) -> None:
        session = get_session("guided-croissant")
        matched_item = {"id": 12, "name": "Thyme Croissant", "category": "Bakery"}
        add_result = {"cart_id": "cart789", "cart": [{"name": "Thyme Croissant", "qty": 1}]}

        with patch(
            "app.services.orchestrator.resolve_intent",
            new=AsyncMock(
                side_effect=[
                    resolved_add_items("thyme croissant"),
                    resolved_guided_response(),
                    resolved_guided_response(),
                ]
            ),
        ), patch(
            "app.services.tools.fetch_menu_items",
            new=AsyncMock(return_value=[matched_item]),
        ), patch(
            "app.services.tools.find_menu_item_by_name",
            new=AsyncMock(return_value=matched_item),
        ), patch(
            "app.services.tools.fetch_menu_item_detail",
            new=AsyncMock(return_value=build_croissant_menu_detail()),
        ), patch(
            "app.services.tools.add_item_to_cart",
            new=AsyncMock(return_value=add_result),
        ) as add_to_cart_mock, patch(
            "app.services.tools.fetch_featured_items",
            new=AsyncMock(return_value=[]),
        ), patch(
            "app.services.suggestions.suggest_popular_items",
            return_value=[],
        ), patch(
            "app.services.suggestions.suggest_complementary_items",
            return_value=[],
        ):
            start_response = await process_chat_message(
                session_id=session["session_id"],
                message="add thyme croissant",
                cart_id=None,
                session=session,
            )
            self.assertEqual(start_response.metadata["pipeline_stage"], "guided_ordering_start")
            self.assertIn("What warming would you like", start_response.reply)
            self.assertNotIn("Here's what I have", start_response.reply)

            option_response = await process_chat_message(
                session_id=session["session_id"],
                message="no warming",
                cart_id=None,
                session=session,
            )
            self.assertEqual(option_response.metadata["pipeline_stage"], "guided_ordering_instructions")
            self.assertEqual(
                option_response.reply,
                "Any special instructions for your Thyme Croissant? Say 'none' to skip.",
            )

            final_response = await process_chat_message(
                session_id=session["session_id"],
                message="wrapped please",
                cart_id=None,
                session=session,
            )

        self.assertTrue(final_response.cart_updated)
        self.assertEqual(final_response.metadata["pipeline_stage"], "guided_ordering_done")
        self.assertEqual(
            add_to_cart_mock.await_args.kwargs["selected_options"],
            [{"optionName": "No Warming"}],
        )
        self.assertEqual(add_to_cart_mock.await_args.kwargs["instructions"], "wrapped please")

    async def test_guided_order_default_all_finalizes_without_second_intent_resolution(self) -> None:
        session = get_session("guided-defaults")
        matched_item = {"id": 8, "name": "Latte", "category": "Coffee"}
        add_result = {"cart_id": "cart456", "cart": [{"name": "Latte", "qty": 1}]}
        resolve_mock = AsyncMock(side_effect=[resolved_add_items("latte")])

        with patch("app.services.orchestrator.resolve_intent", new=resolve_mock), patch(
            "app.services.tools.fetch_menu_items",
            new=AsyncMock(return_value=[matched_item]),
        ), patch(
            "app.services.tools.find_menu_item_by_name",
            new=AsyncMock(return_value=matched_item),
        ), patch(
            "app.services.tools.fetch_menu_item_detail",
            new=AsyncMock(return_value=build_latte_menu_detail()),
        ), patch(
            "app.services.tools.add_item_to_cart",
            new=AsyncMock(return_value=add_result),
        ) as add_to_cart_mock, patch(
            "app.services.tools.fetch_featured_items",
            new=AsyncMock(return_value=[]),
        ), patch(
            "app.services.suggestions.suggest_popular_items",
            return_value=[],
        ), patch(
            "app.services.suggestions.suggest_complementary_items",
            return_value=[],
        ):
            await process_chat_message(
                session_id=session["session_id"],
                message="i want a latte",
                cart_id=None,
                session=session,
            )
            response = await process_chat_message(
                session_id=session["session_id"],
                message="default all",
                cart_id=None,
                session=session,
            )

        self.assertEqual(resolve_mock.await_count, 1)
        self.assertTrue(response.cart_updated)
        self.assertEqual(response.metadata["pipeline_stage"], "guided_ordering_default_all")
        self.assertEqual(add_to_cart_mock.await_args.kwargs["selected_options"], [])

    async def test_guided_order_clear_cart_interrupts_normally(self) -> None:
        session = get_session("guided-interrupt")
        matched_item = {"id": 8, "name": "Latte", "category": "Coffee"}

        with patch(
            "app.services.orchestrator.resolve_intent",
            new=AsyncMock(
                side_effect=[
                    resolved_add_items("latte"),
                    {
                        "intent": "clear_cart",
                        "items": [],
                        "confidence": 1.0,
                        "fallback_needed": False,
                        "route_to_fallback": False,
                        "reason": "",
                    },
                ]
            ),
        ), patch(
            "app.services.tools.fetch_menu_items",
            new=AsyncMock(return_value=[matched_item]),
        ), patch(
            "app.services.tools.find_menu_item_by_name",
            new=AsyncMock(return_value=matched_item),
        ), patch(
            "app.services.tools.fetch_menu_item_detail",
            new=AsyncMock(return_value=build_latte_menu_detail()),
        ), patch(
            "app.services.tools.clear_cart",
            new=AsyncMock(return_value={"cart_id": "cart999", "cart": []}),
        ):
            await process_chat_message(
                session_id=session["session_id"],
                message="i want a latte",
                cart_id=None,
                session=session,
            )
            response = await process_chat_message(
                session_id=session["session_id"],
                message="clear cart",
                cart_id=None,
                session=session,
            )

        self.assertEqual(response.intent, "clear_cart")
        self.assertTrue(response.cart_updated)
        self.assertIsNone(get_session(session["session_id"]).get("stage"))

    async def test_guided_order_abort_phrase_cancels_without_llm(self) -> None:
        session = get_session("guided-abort")
        matched_item = {"id": 8, "name": "Latte", "category": "Coffee"}
        resolve_mock = AsyncMock(side_effect=[resolved_add_items("latte")])

        with patch("app.services.orchestrator.resolve_intent", new=resolve_mock), patch(
            "app.services.tools.fetch_menu_items",
            new=AsyncMock(return_value=[matched_item]),
        ), patch(
            "app.services.tools.find_menu_item_by_name",
            new=AsyncMock(return_value=matched_item),
        ), patch(
            "app.services.tools.fetch_menu_item_detail",
            new=AsyncMock(return_value=build_latte_menu_detail()),
        ), patch(
            "app.services.tools.fetch_featured_items",
            new=AsyncMock(return_value=[]),
        ), patch(
            "app.services.suggestions.suggest_popular_items",
            return_value=[],
        ), patch(
            "app.services.suggestions.suggest_complementary_items",
            return_value=[],
        ):
            await process_chat_message(
                session_id=session["session_id"],
                message="i want a latte",
                cart_id=None,
                session=session,
            )
            response = await process_chat_message(
                session_id=session["session_id"],
                message="never mind",
                cart_id=None,
                session=session,
            )

        self.assertEqual(resolve_mock.await_count, 1)
        self.assertEqual(response.metadata["pipeline_stage"], "guided_ordering_aborted")
        self.assertIn("won't add", response.reply)
        self.assertIsNone(get_session(session["session_id"]).get("stage"))


class CostOptimizationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        sessions.clear()

    async def test_static_reply_bypasses_resolve_for_hi(self) -> None:
        session = get_session("static-hi")
        resolve_mock = AsyncMock()

        with patch("app.services.orchestrator.resolve_intent", new=resolve_mock):
            response = await process_chat_message(
                session_id=session["session_id"],
                message="hi",
                cart_id=None,
                session=session,
            )

        self.assertEqual(response.metadata["pipeline_stage"], "static_reply")
        self.assertEqual(response.reply, "Hi! What can I get for you today?")
        self.assertEqual(resolve_mock.await_count, 0)

    async def test_static_reply_is_bypassed_during_checkout_summary(self) -> None:
        session = get_session("checkout-hi")
        set_session_stage(session["session_id"], "checkout_summary")
        resolve_mock = AsyncMock(
            return_value={
                "intent": "unknown",
                "items": [],
                "confidence": 0.0,
                "fallback_needed": True,
                "route_to_fallback": True,
                "reason": "unknown_intent",
            }
        )

        with patch("app.services.orchestrator.resolve_intent", new=resolve_mock), patch(
            "app.services.orchestrator.generate_fallback_reply",
            new=AsyncMock(return_value="Fallback hi"),
        ):
            response = await process_chat_message(
                session_id=session["session_id"],
                message="hi",
                cart_id=None,
                session=session,
            )

        self.assertEqual(resolve_mock.await_count, 1)
        self.assertEqual(response.reply, "Fallback hi")
        self.assertEqual(response.metadata["pipeline_stage"], "fallback_response")

    async def test_guided_direct_word_skip_bypasses_resolve(self) -> None:
        session = get_session("guided-skip")
        set_session_stage(session["session_id"], "guided_ordering")
        set_guided_order_item_id(session["session_id"], 8)
        set_guided_order_item_name(session["session_id"], "Latte")
        set_guided_order_quantity(session["session_id"], 1)
        required_groups = build_latte_menu_detail()["variants"][:2]
        set_guided_order_required_groups(session["session_id"], required_groups)
        set_guided_order_optional_groups(session["session_id"], [])
        set_guided_order_groups(session["session_id"], required_groups)
        set_guided_order_phase(session["session_id"], 1)
        set_guided_order_step(session["session_id"], 0)
        set_guided_order_selections(session["session_id"], {})
        resolve_mock = AsyncMock()

        with patch("app.services.orchestrator.resolve_intent", new=resolve_mock):
            response = await process_chat_message(
                session_id=session["session_id"],
                message="skip",
                cart_id=None,
                session=session,
            )

        self.assertEqual(resolve_mock.await_count, 0)
        self.assertEqual(response.intent, "guided_order_response")
        self.assertEqual(response.metadata["pipeline_stage"], "guided_ordering_required_clarify")

    async def test_guided_direct_word_done_bypasses_resolve_in_phase2(self) -> None:
        session = get_session("guided-done")
        set_session_stage(session["session_id"], "guided_ordering")
        set_guided_order_item_id(session["session_id"], 8)
        set_guided_order_item_name(session["session_id"], "Latte")
        set_guided_order_quantity(session["session_id"], 1)
        optional_groups = build_latte_menu_detail()["variants"][2:]
        set_guided_order_required_groups(session["session_id"], [])
        set_guided_order_optional_groups(session["session_id"], optional_groups)
        set_guided_order_groups(session["session_id"], optional_groups)
        set_guided_order_phase(session["session_id"], 2)
        set_guided_order_step(session["session_id"], 0)
        set_guided_order_selections(session["session_id"], {"Choose Size": "Medium"})
        resolve_mock = AsyncMock()

        with patch("app.services.orchestrator.resolve_intent", new=resolve_mock):
            response = await process_chat_message(
                session_id=session["session_id"],
                message="done",
                cart_id=None,
                session=session,
            )

        self.assertEqual(resolve_mock.await_count, 0)
        self.assertEqual(response.metadata["pipeline_stage"], "guided_ordering_instructions")

    async def test_phase3_heuristic_select_bypasses_phase3_llm(self) -> None:
        session = get_session("phase3-select")
        set_session_stage(session["session_id"], "guided_ordering")
        set_guided_order_item_id(session["session_id"], 8)
        set_guided_order_item_name(session["session_id"], "Latte")
        set_guided_order_quantity(session["session_id"], 1)
        optional_groups = build_latte_menu_detail()["variants"][2:]
        set_guided_order_required_groups(session["session_id"], [])
        set_guided_order_optional_groups(session["session_id"], optional_groups)
        set_guided_order_groups(session["session_id"], optional_groups)
        set_guided_order_phase(session["session_id"], 3)
        set_guided_order_step(session["session_id"], 0)
        set_guided_order_selections(session["session_id"], {"Choose Size": "Medium", "Milk": "Oat Milk"})

        with patch(
            "app.services.orchestrator.resolve_intent",
            new=AsyncMock(return_value=resolved_guided_response()),
        ), patch(
            "app.services.orchestrator._interpret_phase3_response",
            new=AsyncMock(),
        ) as phase3_mock:
            response = await process_chat_message(
                session_id=session["session_id"],
                message="Extra Shot",
                cart_id=None,
                session=session,
            )

        self.assertEqual(phase3_mock.await_count, 0)
        self.assertEqual(response.metadata["pipeline_stage"], "guided_ordering_phase3_select")
        self.assertIn("Added Extra Shot", response.reply)

    async def test_phase3_heuristic_query_bypasses_phase3_llm(self) -> None:
        session = get_session("phase3-query")
        set_session_stage(session["session_id"], "guided_ordering")
        set_guided_order_item_id(session["session_id"], 8)
        set_guided_order_item_name(session["session_id"], "Latte")
        set_guided_order_quantity(session["session_id"], 1)
        optional_groups = build_latte_menu_detail()["variants"][2:]
        set_guided_order_required_groups(session["session_id"], [])
        set_guided_order_optional_groups(session["session_id"], optional_groups)
        set_guided_order_groups(session["session_id"], optional_groups)
        set_guided_order_phase(session["session_id"], 3)
        set_guided_order_step(session["session_id"], 0)
        set_guided_order_selections(session["session_id"], {"Choose Size": "Medium"})

        with patch(
            "app.services.orchestrator.resolve_intent",
            new=AsyncMock(return_value=resolved_guided_response()),
        ), patch(
            "app.services.orchestrator._interpret_phase3_response",
            new=AsyncMock(),
        ) as phase3_mock:
            response = await process_chat_message(
                session_id=session["session_id"],
                message="what extras do you have?",
                cart_id=None,
                session=session,
            )

        self.assertEqual(phase3_mock.await_count, 0)
        self.assertEqual(response.metadata["pipeline_stage"], "guided_ordering_phase3_query")
        self.assertIn("For extras", response.reply)

    async def test_static_fallback_handles_bare_affirmation_without_fallback_llm(self) -> None:
        session = get_session("static-fallback")
        resolve_mock = AsyncMock(
            return_value={
                "intent": "unknown",
                "items": [],
                "confidence": 0.0,
                "fallback_needed": True,
                "route_to_fallback": True,
                "reason": "bare_affirmation_needs_context",
            }
        )

        with patch("app.services.orchestrator.resolve_intent", new=resolve_mock), patch(
            "app.services.orchestrator.generate_fallback_reply",
            new=AsyncMock(),
        ) as fallback_mock:
            response = await process_chat_message(
                session_id=session["session_id"],
                message="yes",
                cart_id=None,
                session=session,
            )

        self.assertEqual(fallback_mock.await_count, 0)
        self.assertEqual(response.metadata["fallback_source"], "static")
        self.assertIn("did you mean to checkout", response.reply)


class FallbackPromptTests(unittest.TestCase):
    def test_unknown_intent_prompt_marks_mid_conversation(self) -> None:
        prompt = _build_fallback_system_prompt("unknown_intent")
        self.assertIn("Do not say 'Welcome'", prompt)
        self.assertIn("already in a conversation", prompt)
        self.assertIn("what they'd like to order", prompt)

    def test_bare_affirmation_prompt_uses_confirmation_language(self) -> None:
        prompt = _build_fallback_system_prompt("bare_affirmation_needs_context")
        self.assertIn("Just to confirm", prompt)
        self.assertIn("did you want to checkout", prompt)


if __name__ == "__main__":
    unittest.main()
