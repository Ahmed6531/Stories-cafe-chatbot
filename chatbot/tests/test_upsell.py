from chatbot.handlers.upsell import get_upsell_suggestion

def test_basic_mapping():
    session = {}
    s = get_upsell_suggestion("coffee", session)
    assert s == "croissant"

def test_no_repeat():
    session = {"upsell_suggestions": ["croissant"]}
    s = get_upsell_suggestion("coffee", session)
    assert s is None
