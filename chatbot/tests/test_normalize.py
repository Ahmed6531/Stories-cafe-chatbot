import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.utils.normalize import normalize_user_message


def test_action_verb_typos_are_corrected():
    assert normalize_user_message("udpate the latte to oat milk") == "update the latte to oat milk"
    assert normalize_user_message("chnage my labneh to brown bread") == "change my labneh to brown bread"
    assert normalize_user_message("remvoe the croissant") == "remove the croissant"
    assert normalize_user_message("veiw cart") == "view cart"
    assert normalize_user_message("chekout") == "checkout"


def test_short_command_typos_are_corrected_without_touching_items():
    assert normalize_user_message("ad the last one with extra pepper") == "add the last one with extra pepper"
    assert normalize_user_message("repat my last order") == "repeat my last order"
    assert normalize_user_message("reoder my last order") == "reorder my last order"
    assert normalize_user_message("swich the latte to medium") == "switch the latte to medium"
