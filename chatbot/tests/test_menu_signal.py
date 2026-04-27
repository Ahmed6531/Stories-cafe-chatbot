import sys
import time
import types
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _google_stub_modules() -> dict[str, types.ModuleType]:
    genai_stub = types.ModuleType("google.generativeai")
    google_stub = types.ModuleType("google")
    google_stub.generativeai = genai_stub
    return {
        "google": google_stub,
        "google.generativeai": genai_stub,
    }


@pytest.mark.asyncio
async def test_get_menu_signal_collects_live_menu_data():
    from app.services.menu_signal import MenuSignal, get_menu_signal
    import app.services.menu_signal as menu_signal_module

    original_signal = menu_signal_module._signal
    menu_signal_module._signal = MenuSignal()

    menu_items = [
        {"id": 1, "name": "Iced Latte", "category": {"name": "Coffee"}},
        {"id": 2, "name": "Chocolate Croissant", "category": {"name": "Pastries"}},
    ]
    detail = {
        "variantGroupDetails": [
            {
                "isActive": True,
                "options": [
                    {"name": "Oat Milk", "isActive": True},
                    {"name": "Large", "isActive": True},
                ],
            }
        ]
    }

    try:
        with patch("app.services.tools.fetch_menu_items", new=AsyncMock(return_value=menu_items)), \
             patch("app.services.tools.fetch_menu_item_detail", new=AsyncMock(return_value=detail)):
            signal = await get_menu_signal()

        assert signal.category_names == frozenset({"coffee", "pastries"})
        assert "iced latte" in signal.item_names
        assert "latte" in signal.item_name_tokens
        assert "croissant" in signal.item_name_tokens
        assert "oat milk" in signal.option_names
        assert "oat" in signal.item_name_tokens
    finally:
        menu_signal_module._signal = original_signal


def test_static_reply_guard_uses_query_words_and_menu_terms():
    with patch.dict(sys.modules, _google_stub_modules()):
        from app.services.menu_signal import MenuSignal
        from app.services.orchestrator import _get_static_reply
        from app.utils.static_replies import STATIC_REPLY_TABLE
        import app.services.menu_signal as menu_signal_module

        original_signal = menu_signal_module._signal
        menu_signal_module._signal = MenuSignal(
            category_names=frozenset({"pastries"}),
            item_name_tokens=frozenset({"latte", "cappuccino"}),
            item_names=frozenset({"iced latte"}),
            option_names=frozenset({"oat milk"}),
            refreshed_at=time.monotonic(),
        )

        try:
            assert _get_static_reply("hello") in STATIC_REPLY_TABLE.values()
            assert _get_static_reply("hi i want a latte") is None
            assert _get_static_reply("great can i get a cappuccino") is None
            assert _get_static_reply("thanks im ready to checkout") is None
        finally:
            menu_signal_module._signal = original_signal


@pytest.mark.asyncio
async def test_resolve_intent_routes_dynamic_category_names_without_llm():
    from app.services.intent_pipeline import resolve_intent
    from app.services.menu_signal import MenuSignal

    signal = MenuSignal(
        category_names=frozenset({"boba"}),
        refreshed_at=time.monotonic(),
    )

    with patch("app.services.menu_signal.get_menu_signal", new=AsyncMock(return_value=signal)), \
         patch("app.services.intent_pipeline.try_interpret_message", new=AsyncMock(side_effect=AssertionError("LLM should not be called"))):
        resolved = await resolve_intent(
            "what boba do you have",
            session={},
            cart={},
            menu=[],
        )

    assert resolved["intent"] == "list_category_items"
    assert resolved["items"] == [{"category": "boba"}]
    assert resolved["source"] == "deterministic"
