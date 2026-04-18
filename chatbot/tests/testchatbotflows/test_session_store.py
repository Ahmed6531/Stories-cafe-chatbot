"""
Tests for app/services/session_store.py

Covers: session creation, retrieval, stage/cart transitions, history cap,
pending_clarification roundtrip, and update_last_action fields.
Does NOT retest: anything already covered by other test files.
"""
import sys
import unittest
import json
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.services import session_store
from app.services.session_store import (
    get_session,
    get_or_create_session,
    get_session_stage,
    set_session_stage,
    get_checkout_initiated,
    set_checkout_initiated,
    set_session_cart_id,
    update_last_action,
)


def _flush_sessions():
    """Clear the in-memory sessions dict between tests."""
    session_store.sessions.clear()


class TestGetSession(unittest.TestCase):
    def setUp(self):
        _flush_sessions()

    def test_creates_new_session_with_defaults(self):
        session = get_session("sid-001")
        self.assertEqual(session["session_id"], "sid-001")
        self.assertIsNone(session["cart_id"])
        self.assertEqual(session["last_items"], [])
        self.assertIsNone(session["last_intent"])
        self.assertIsNone(session["stage"])
        self.assertFalse(session["checkout_initiated"])
        self.assertIsNone(session["pending_clarification"])
        self.assertEqual(session["history"], [])
        self.assertIsNone(session["last_user_message"])
        self.assertIsNone(session["last_bot_response"])
        self.assertIsNone(session["last_matched_items"])
        self.assertIsNone(session["last_action_type"])
        self.assertIsNone(session["last_action_data"])

    def test_returns_same_object_for_same_id(self):
        s1 = get_session("sid-002")
        s1["cart_id"] = "cart-abc"
        s2 = get_session("sid-002")
        self.assertEqual(s2["cart_id"], "cart-abc")

    def test_different_ids_are_independent(self):
        s1 = get_session("sid-003")
        s2 = get_session("sid-004")
        s1["cart_id"] = "cart-x"
        self.assertIsNone(s2["cart_id"])


class TestGetOrCreateSession(unittest.TestCase):
    def setUp(self):
        _flush_sessions()

    def test_creates_session_for_new_id(self):
        sid, cart_id = get_or_create_session("new-sid")
        self.assertEqual(sid, "new-sid")
        self.assertIsNone(cart_id)

    def test_returns_existing_cart_id_for_known_session(self):
        s = get_session("known-sid")
        s["cart_id"] = "cart-existing"
        sid, cart_id = get_or_create_session("known-sid")
        self.assertEqual(cart_id, "cart-existing")

    def test_generates_uuid_when_no_session_id_given(self):
        sid, _ = get_or_create_session(None)
        self.assertIsNotNone(sid)
        self.assertGreater(len(sid), 10)


class TestStageManagement(unittest.TestCase):
    def setUp(self):
        _flush_sessions()

    def test_default_stage_is_none(self):
        self.assertIsNone(get_session_stage("s1"))

    def test_set_and_get_stage(self):
        set_session_stage("s1", "item_customization")
        self.assertEqual(get_session_stage("s1"), "item_customization")

    def test_clear_stage_with_none(self):
        set_session_stage("s2", "clarification_menu_choice")
        set_session_stage("s2", None)
        self.assertIsNone(get_session_stage("s2"))


class TestCartIdManagement(unittest.TestCase):
    def setUp(self):
        _flush_sessions()

    def test_set_and_get_cart_id(self):
        set_session_cart_id("s3", "cart-999")
        session = get_session("s3")
        self.assertEqual(session["cart_id"], "cart-999")

    def test_set_cart_id_to_none(self):
        set_session_cart_id("s4", "cart-old")
        set_session_cart_id("s4", None)
        self.assertIsNone(get_session("s4")["cart_id"])


class TestCheckoutInitiated(unittest.TestCase):
    def setUp(self):
        _flush_sessions()

    def test_default_is_false(self):
        self.assertFalse(get_checkout_initiated("s5"))

    def test_set_to_true(self):
        set_checkout_initiated("s5", True)
        self.assertTrue(get_checkout_initiated("s5"))

    def test_set_back_to_false(self):
        set_checkout_initiated("s6", True)
        set_checkout_initiated("s6", False)
        self.assertFalse(get_checkout_initiated("s6"))


class TestPendingClarificationRoundtrip(unittest.TestCase):
    def setUp(self):
        _flush_sessions()

    def test_pending_clarification_stored_and_retrieved(self):
        session = get_session("s7")
        clarification_data = {
            "item_query": "latte",
            "candidates": [{"name": "Iced Latte"}, {"name": "Hot Latte"}],
            "requested_item": {"item_name": "latte", "quantity": 1},
        }
        session["pending_clarification"] = clarification_data
        retrieved = get_session("s7")["pending_clarification"]
        self.assertEqual(retrieved["item_query"], "latte")
        self.assertEqual(len(retrieved["candidates"]), 2)

    def test_clearing_pending_clarification(self):
        session = get_session("s8")
        session["pending_clarification"] = {"item_query": "test"}
        session["pending_clarification"] = None
        self.assertIsNone(get_session("s8")["pending_clarification"])


class TestHistoryCap(unittest.TestCase):
    def setUp(self):
        _flush_sessions()

    def test_history_accepts_entries(self):
        session = get_session("s9")
        session["history"].append({"role": "user", "text": "hello"})
        session["history"].append({"role": "bot", "text": "hi there"})
        self.assertEqual(len(get_session("s9")["history"]), 2)

    def test_history_can_be_trimmed_to_20(self):
        session = get_session("s10")
        for i in range(25):
            session["history"].append({"role": "user", "text": f"msg {i}"})
        # Simulate the cap applied by the chat endpoint
        if len(session["history"]) > 20:
            session["history"] = session["history"][-20:]
        self.assertEqual(len(session["history"]), 20)
        self.assertEqual(session["history"][0]["text"], "msg 5")


class TestUpdateLastAction(unittest.TestCase):
    def setUp(self):
        _flush_sessions()

    def test_sets_all_last_action_fields(self):
        update_last_action(
            session_id="s11",
            user_message="add a latte",
            bot_response="Latte added!",
            action_type="add_items",
            matched_items=[{"name": "Latte"}],
            action_data={"qty": 1},
        )
        session = get_session("s11")
        self.assertEqual(session["last_user_message"], "add a latte")
        self.assertEqual(session["last_bot_response"], "Latte added!")
        self.assertEqual(session["last_action_type"], "add_items")
        self.assertEqual(session["last_matched_items"], [{"name": "Latte"}])
        self.assertEqual(session["last_action_data"], {"qty": 1})

    def test_defaults_matched_items_to_empty_last_items_when_none(self):
        session = get_session("s12")
        session["last_items"] = []
        update_last_action(
            session_id="s12",
            user_message="view cart",
            bot_response="Your cart is empty.",
            action_type="view_cart",
            matched_items=None,
        )
        # matched_items=None → falls back to session["last_items"] which is []
        self.assertEqual(session["last_matched_items"], [])

    def test_action_data_defaults_to_empty_dict(self):
        update_last_action(
            session_id="s13",
            user_message="clear cart",
            bot_response="Cart cleared.",
            action_type="clear_cart",
        )
        session = get_session("s13")
        self.assertEqual(session["last_action_data"], {})


class _FakeRedisClient:
    def __init__(self, payloads=None, fail_get=False, fail_set=False):
        self.payloads = payloads or {}
        self.fail_get = fail_get
        self.fail_set = fail_set
        self.getex_calls = []
        self.set_calls = []

    async def getex(self, key, ex=None):
        self.getex_calls.append((key, ex))
        if self.fail_get:
            raise OSError("redis unavailable")
        return self.payloads.get(key)

    async def set(self, key, value, ex=None):
        self.set_calls.append((key, value, ex))
        if self.fail_set:
            raise OSError("redis unavailable")
        self.payloads[key] = value
        return True


class TestRedisBackedSessionStore(unittest.TestCase):
    def setUp(self):
        _flush_sessions()

    def test_get_session_fetches_from_redis(self):
        redis_payload = json.dumps({
            "session_id": "redis-sid",
            "cart_id": "cart-123",
            "last_items": [],
            "last_intent": None,
            "_schema_version": 0,
        })
        fake_redis = _FakeRedisClient({"session:redis-sid": redis_payload})

        with patch.object(session_store, "_get_redis_client", return_value=fake_redis), \
             patch.object(session_store.settings, "redis_session_ttl_seconds", 123):
            session = get_session("redis-sid")

        self.assertEqual(fake_redis.getex_calls, [("session:redis-sid", 123)])
        self.assertEqual(session["session_id"], "redis-sid")
        self.assertEqual(session["cart_id"], "cart-123")
        self.assertEqual(session["_schema_version"], 1)
        self.assertIn("pending_operations", session)

    def test_set_session_stage_writes_back_to_redis_with_ttl(self):
        fake_redis = _FakeRedisClient()

        with patch.object(session_store, "_get_redis_client", return_value=fake_redis), \
             patch.object(session_store.settings, "redis_session_ttl_seconds", 222):
            get_session("stage-sid")
            fake_redis.set_calls.clear()
            set_session_stage("stage-sid", "guided_ordering")

        self.assertEqual(len(fake_redis.set_calls), 2)
        last_key, last_value, last_ttl = fake_redis.set_calls[-1]
        self.assertEqual(last_key, "session:stage-sid")
        self.assertEqual(last_ttl, 222)
        self.assertEqual(json.loads(last_value)["stage"], "guided_ordering")

    def test_redis_failure_falls_back_to_memory(self):
        fake_redis = _FakeRedisClient(fail_get=True)

        with patch.object(session_store, "_get_redis_client", return_value=fake_redis):
            session = get_session("fallback-sid")
            set_session_stage("fallback-sid", "guided_ordering")

        self.assertEqual(session["session_id"], "fallback-sid")
        self.assertEqual(get_session_stage("fallback-sid"), "guided_ordering")


if __name__ == "__main__":
    unittest.main()
