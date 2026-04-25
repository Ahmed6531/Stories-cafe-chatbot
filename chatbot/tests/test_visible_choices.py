import pytest

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
