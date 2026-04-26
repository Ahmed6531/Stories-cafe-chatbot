import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.slot_filler import (
    build_group_prompt,
    build_open_customization_prompt,
    build_suboption_prompt,
    fill_slots_from_text,
    get_empty_required_groups,
    init_slot_state,
    reconstruct_slot_state_from_cart,
    slot_state_summary,
    slot_state_to_selected_options,
)


def labneh_groups_meta():
    suboptions = [
        {"name": "Less", "additionalPrice": 0},
        {"name": "Regular", "additionalPrice": 0},
        {"name": "Extra", "additionalPrice": 0},
    ]
    return [
        {
            "groupId": "sandwich-bread-options",
            "name": "Choose Bread",
            "customerLabel": "Bread",
            "isRequired": True,
            "maxSelections": 1,
            "isActive": True,
            "options": [
                {"name": "White Bread", "isActive": True, "additionalPrice": 0, "suboptions": []},
                {"name": "Brown Bread", "isActive": True, "additionalPrice": 50000, "suboptions": []},
            ],
        },
        {
            "groupId": "sandwich-ingredients",
            "name": "Ingredients",
            "customerLabel": "Ingredients",
            "isRequired": False,
            "maxSelections": 10,
            "isActive": True,
            "options": [
                {"name": "Mint", "isActive": True, "additionalPrice": 0, "suboptions": []},
                {"name": "Rocca", "isActive": True, "additionalPrice": 0, "suboptions": []},
                {"name": "Olives", "isActive": True, "additionalPrice": 0, "suboptions": []},
                {"name": "Cherry Tomatoes", "isActive": True, "additionalPrice": 0, "suboptions": []},
                {"name": "Onion", "isActive": True, "additionalPrice": 0, "suboptions": []},
                {"name": "Jalapeno", "isActive": True, "additionalPrice": 0, "suboptions": []},
                {"name": "Pickles", "isActive": True, "additionalPrice": 0, "suboptions": []},
            ],
        },
        {
            "groupId": "sandwich-toppings",
            "name": "Toppings",
            "customerLabel": "Toppings",
            "isRequired": False,
            "maxSelections": 10,
            "isActive": True,
            "options": [
                {"name": "Mayo", "isActive": True, "additionalPrice": 0, "suboptions": suboptions},
                {"name": "BBQ", "isActive": True, "additionalPrice": 0, "suboptions": suboptions},
                {"name": "Honey Mustard", "isActive": True, "additionalPrice": 0, "suboptions": suboptions},
                {"name": "Mustard", "isActive": True, "additionalPrice": 0, "suboptions": suboptions},
                {"name": "Salt", "isActive": True, "additionalPrice": 0, "suboptions": suboptions},
                {"name": "Pepper", "isActive": True, "additionalPrice": 0, "suboptions": suboptions},
            ],
        },
        {
            "groupId": "sandwich-extras",
            "name": "Extras",
            "customerLabel": "Extras",
            "isRequired": False,
            "maxSelections": 5,
            "isActive": True,
            "options": [
                {"name": "Cheddar Cheese", "isActive": True, "additionalPrice": 100000, "suboptions": []},
                {"name": "Chicken Teriyaki", "isActive": True, "additionalPrice": 150000, "suboptions": []},
                {"name": "Tuna", "isActive": True, "additionalPrice": 200000, "suboptions": []},
                {"name": "Roast Beef", "isActive": True, "additionalPrice": 150000, "suboptions": []},
                {"name": "Beef Ham", "isActive": True, "additionalPrice": 150000, "suboptions": []},
            ],
        },
        {
            "groupId": "inactive-group",
            "name": "Inactive",
            "customerLabel": "Inactive",
            "isRequired": False,
            "maxSelections": 1,
            "isActive": False,
            "options": [{"name": "Hidden", "isActive": True, "suboptions": []}],
        },
    ]


def filled_state(text):
    groups = labneh_groups_meta()
    state = init_slot_state(groups)
    return fill_slots_from_text(text, groups, state)


def test_init_slot_state_all_empty():
    state = init_slot_state(labneh_groups_meta())
    assert state == {
        "sandwich-bread-options": [],
        "sandwich-ingredients": [],
        "sandwich-toppings": [],
        "sandwich-extras": [],
    }


def test_fill_white_bread():
    state, applied, unmatched = filled_state("white bread")
    assert state["sandwich-bread-options"][0]["optionName"] == "White Bread"
    assert applied == ["White Bread"]
    assert unmatched == []


def test_fill_extra_mayo():
    state, applied, unmatched = filled_state("extra mayo")
    assert state["sandwich-toppings"][0] == {
        "optionName": "Mayo",
        "suboptionName": "Extra",
        "groupId": "sandwich-toppings",
    }
    assert applied == ["Mayo (Extra)"]
    assert unmatched == []


def test_fill_mayo_no_suboption():
    state, applied, unmatched = filled_state("mayo")
    assert state["sandwich-toppings"][0]["optionName"] == "Mayo"
    assert state["sandwich-toppings"][0]["suboptionName"] is None
    assert applied == ["Mayo"]
    assert unmatched == []


def test_fill_regular_bbq():
    state, applied, unmatched = filled_state("regular bbq")
    assert state["sandwich-toppings"][0]["optionName"] == "BBQ"
    assert state["sandwich-toppings"][0]["suboptionName"] == "Regular"
    assert applied == ["BBQ (Regular)"]
    assert unmatched == []


def test_remove_mayo():
    groups = labneh_groups_meta()
    state = init_slot_state(groups)
    state, _, _ = fill_slots_from_text("extra mayo", groups, state)
    state, applied, unmatched = fill_slots_from_text("no mayo", groups, state)
    assert state["sandwich-toppings"] == []
    assert applied == ["Removed Mayo"]
    assert unmatched == []


def test_remove_without_prefix():
    groups = labneh_groups_meta()
    state = init_slot_state(groups)
    state, _, _ = fill_slots_from_text("pickles", groups, state)
    state, applied, unmatched = fill_slots_from_text("without pickles", groups, state)
    assert state["sandwich-ingredients"] == []
    assert applied == ["Removed Pickles"]
    assert unmatched == []


def test_fill_multiple_ingredients():
    state, applied, unmatched = filled_state("mint and rocca and olives")
    assert [entry["optionName"] for entry in state["sandwich-ingredients"]] == ["Mint", "Rocca", "Olives"]
    assert applied == ["Mint", "Rocca", "Olives"]
    assert unmatched == []


def test_fill_cross_group():
    state, applied, unmatched = filled_state("white bread and extra mayo and rocca")
    assert state["sandwich-bread-options"][0]["optionName"] == "White Bread"
    assert state["sandwich-toppings"][0]["suboptionName"] == "Extra"
    assert state["sandwich-ingredients"][0]["optionName"] == "Rocca"
    assert applied == ["White Bread", "Mayo (Extra)", "Rocca"]
    assert unmatched == []


def test_replace_bread():
    groups = labneh_groups_meta()
    state = init_slot_state(groups)
    state, _, _ = fill_slots_from_text("white bread", groups, state)
    state, applied, unmatched = fill_slots_from_text("actually brown bread instead", groups, state)
    assert state["sandwich-bread-options"] == [
        {"optionName": "Brown Bread", "suboptionName": None, "groupId": "sandwich-bread-options"}
    ]
    assert applied == ["Brown Bread"]
    assert unmatched == []


def test_slot_state_summary_empty():
    groups = labneh_groups_meta()
    assert slot_state_summary(init_slot_state(groups), groups) == "no customizations yet"


def test_slot_state_summary_with_selections():
    groups = labneh_groups_meta()
    state = init_slot_state(groups)
    state, _, _ = fill_slots_from_text("white bread and extra mayo and rocca and cheddar cheese", groups, state)
    assert slot_state_summary(state, groups) == "White Bread, Rocca, Extra Mayo, Cheddar Cheese"


def test_wire_format_no_suboption():
    state, _, _ = filled_state("white bread")
    selected = slot_state_to_selected_options(state, labneh_groups_meta())
    assert selected == [{"optionName": "White Bread", "groupId": "sandwich-bread-options"}]
    assert "suboptionName" not in selected[0]


def test_wire_format_with_suboption():
    state, _, _ = filled_state("extra mayo")
    selected = slot_state_to_selected_options(state, labneh_groups_meta())
    assert selected == [
        {"optionName": "Mayo", "groupId": "sandwich-toppings", "suboptionName": "Extra"}
    ]


def test_reconstruct_from_cart_with_groupid():
    groups = labneh_groups_meta()
    state = reconstruct_slot_state_from_cart(
        [{"optionName": "Mayo", "suboptionName": "Extra", "groupId": "sandwich-toppings"}],
        groups,
    )
    assert state["sandwich-toppings"][0]["optionName"] == "Mayo"
    assert state["sandwich-toppings"][0]["suboptionName"] == "Extra"


def test_reconstruct_from_cart_without_groupid():
    groups = labneh_groups_meta()
    state = reconstruct_slot_state_from_cart([{"optionName": "Rocca"}], groups)
    assert state["sandwich-ingredients"][0] == {
        "optionName": "Rocca",
        "suboptionName": None,
        "groupId": "sandwich-ingredients",
    }


def test_get_empty_required_groups_all_empty():
    groups = labneh_groups_meta()
    state = init_slot_state(groups)
    assert [group["groupId"] for group in get_empty_required_groups(state, groups)] == [
        "sandwich-bread-options"
    ]


def test_get_empty_required_groups_bread_filled():
    groups = labneh_groups_meta()
    state = init_slot_state(groups)
    state, _, _ = fill_slots_from_text("white bread", groups, state)
    assert get_empty_required_groups(state, groups) == []


def test_build_group_prompt_required():
    group = labneh_groups_meta()[0]
    assert build_group_prompt("Labneh", group, is_first=True) == (
        "What bread would you like for your Labneh? Options: "
        "White Bread, Brown Bread (+L.L 50,000)."
    )


def test_build_group_prompt_with_price():
    group = labneh_groups_meta()[3]
    assert build_group_prompt("Labneh", group, is_first=False) == (
        "What extras would you like? Options: Cheddar Cheese (+L.L 100,000), "
        "Chicken Teriyaki (+L.L 150,000), Tuna (+L.L 200,000), "
        "Roast Beef (+L.L 150,000), Beef Ham (+L.L 150,000). You can choose up to 5."
    )


def test_build_open_customization_prompt():
    groups = labneh_groups_meta()
    state = init_slot_state(groups)
    state, _, _ = fill_slots_from_text("white bread and extra mayo", groups, state)
    prompt = build_open_customization_prompt("Labneh", state, groups)
    assert prompt.splitlines() == [
        "Got it! Here's what I have for your Labneh: White Bread, Extra Mayo.",
        "Would you like to add anything else?",
        "- Toppings (currently: Extra Mayo): Mayo (Less/Regular/Extra), BBQ (Less/Regular/Extra), Honey Mustard (Less/Regular/Extra), Mustard (Less/Regular/Extra), Salt (Less/Regular/Extra), Pepper (Less/Regular/Extra)",
        "- Ingredients: Mint, Rocca, Olives, Cherry Tomatoes, Onion, Jalapeno, Pickles",
        "- Extras: Cheddar Cheese (+L.L 100,000), Chicken Teriyaki (+L.L 150,000), Tuna (+L.L 200,000), Roast Beef (+L.L 150,000), Beef Ham (+L.L 150,000)",
        "Say 'done' to add to cart.",
    ]


def test_build_open_customization_prompt_without_optional_groups_asks_instructions_once():
    groups = [labneh_groups_meta()[0]]
    state = init_slot_state(groups)
    state, _, _ = fill_slots_from_text("white bread", groups, state)
    prompt = build_open_customization_prompt("Rim 330ML", state, groups)

    assert prompt.splitlines() == [
        "Got it! Here's what I have for your Rim 330ML: White Bread.",
        "Any special instructions for your Rim 330ML? Say 'none' to skip.",
    ]


def test_build_suboption_prompt():
    suboptions = labneh_groups_meta()[2]["options"][0]["suboptions"]
    assert build_suboption_prompt("Labneh", "Mayo", suboptions) == (
        "How would you like your Mayo? Options: Less, Regular, Extra."
    )
