import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.intent_pipeline import resolve_intent
from app.services.session_store import (
    get_session,
    sessions,
    set_last_visible_choices,
)


@pytest.mark.asyncio
async def test_ordinal_add_resolves_from_visible_choices_not_menu_vocab():
    sessions.clear()
    session = get_session("visible-choice-add")
    set_last_visible_choices(
        "visible-choice-add",
        [
            {"item_name": "Rocca Salad", "menu_item_id": 33},
            {"item_name": "Americano", "menu_item_id": 1},
        ],
        source="recommendation",
    )

    resolved = await resolve_intent("add the first one", session, cart={}, menu=[])

    assert resolved["intent"] == "add_items"
    assert resolved["source"] == "deterministic"
    assert resolved["reason"] == "deterministic_visible_choice_ordinal"
    assert resolved["items"][0]["item_name"] == "Rocca Salad"


@pytest.mark.asyncio
async def test_ordinal_add_preserves_inline_modifiers():
    sessions.clear()
    session = get_session("visible-choice-modifiers")
    set_last_visible_choices(
        "visible-choice-modifiers",
        [
            {"item_name": "Chicken Teriyaki"},
            {"item_name": "Turkey & Cheese"},
        ],
        source="list_category_items",
    )

    resolved = await resolve_intent(
        "add the last one with extra pepper white bread and tomatoes",
        session,
        cart={},
        menu=[],
    )

    assert resolved["intent"] == "add_items"
    assert resolved["items"][0]["item_name"] == "Turkey & Cheese"
    assert resolved["items"][0]["modifiers"] == [
        "extra pepper",
        "white bread",
        "tomatoes",
    ]


@pytest.mark.asyncio
async def test_update_item_option_routes_without_llm():
    sessions.clear()
    session = get_session("deterministic-update-item")

    resolved = await resolve_intent(
        "update the chocolate croissant to warmed",
        session,
        cart={},
        menu=[],
    )

    assert resolved["intent"] == "update_item"
    assert resolved["source"] == "deterministic"
    assert resolved["reason"] == "deterministic_match:update_item_option"
    assert resolved["items"][0]["item_query"] == "chocolate croissant"
    assert resolved["items"][0]["modifiers"] == ["warmed"]


@pytest.mark.asyncio
async def test_ordinal_reference_without_visible_choices_does_not_guess_menu_sample():
    sessions.clear()
    session = get_session("visible-choice-missing")

    resolved = await resolve_intent("add the first one", session, cart={}, menu=[])

    assert resolved["intent"] == "unknown"
    assert resolved["route_to_fallback"] is True
    assert resolved["reason"] == "visible_choice_ordinal_unresolvable"


def test_set_last_visible_choices_revives_recommendation_alias():
    sessions.clear()
    get_session("visible-choice-alias")

    set_last_visible_choices(
        "visible-choice-alias",
        [{"item_name": "Cheese Croissant"}, {"name": "Latte"}],
        source="recommendation",
    )

    session = get_session("visible-choice-alias")
    assert [choice["item_name"] for choice in session["last_visible_choices"]] == [
        "Cheese Croissant",
        "Latte",
    ]
    assert session["last_recommendation_items"] == ["Cheese Croissant", "Latte"]
