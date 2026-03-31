# chatbot/handlers/upsell.py

# Simple complementary mapping
COMPLEMENTARY_MAP = {
    "coffee": "croissant",
    "latte": "croissant",
    "sandwich": "iced tea",
    "dessert": "espresso"
}

def get_upsell_suggestion(added_item: str, session_state: dict) -> str | None:
    """
    Return a complementary suggestion string or None.
    Rules:
    - Only suggest if mapping exists
    - Do not repeat same suggestion in session
    - Limit total upsells per session (e.g. 2)
    """
    suggestion = None
    normalized = added_item.lower()

    for key, value in COMPLEMENTARY_MAP.items():
        if key in normalized:
            # anti-repeat check
            already = session_state.get("upsell_suggestions", [])
            if value not in already and len(already) < 2:
                suggestion = value
                already.append(value)
                session_state["upsell_suggestions"] = already
            break

    return suggestion
