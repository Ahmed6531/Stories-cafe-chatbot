import asyncio
import json
import logging
import threading
import uuid
from queue import Queue
from typing import Any, Callable, TypedDict

from app.core.config import settings

try:
    from redis import asyncio as redis_async
    from redis.exceptions import RedisError
except ImportError:  # pragma: no cover - exercised through fallback behavior
    redis_async = None

    class RedisError(Exception):
        pass


logger = logging.getLogger(__name__)


class Session(TypedDict):
    session_id: str
    cart_id: str | None
    last_items: list[dict[str, Any]]
    last_intent: str | None
    stage: str | None
    checkout_initiated: bool
    pending_clarification: dict[str, Any] | None
    history: list[dict[str, str]]
    guided_order_item_id: int | str | None
    guided_order_item_name: str | None
    guided_order_phase: int
    guided_order_step: int
    guided_order_groups: list[dict[str, Any]]
    guided_order_required_groups: list[dict[str, Any]]
    guided_order_optional_groups: list[dict[str, Any]]
    guided_order_selections: dict[str, Any]
    guided_order_quantity: int | None
    last_user_message: str | None
    last_bot_response: str | None
    last_matched_items: list[dict[str, Any]] | None
    last_action_type: str | None
    last_action_data: dict[str, Any] | None
    _schema_version: int
    pending_operations: list[dict]
    pending_operations_context: dict


sessions: dict[str, Session] = {}
_redis_client = None


def _session_key(session_id: str) -> str:
    return f"session:{session_id}"


def _default_session(session_id: str) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "cart_id": None,
        "last_items": [],
        "last_intent": None,
        "stage": None,
        "checkout_initiated": False,
        "pending_clarification": None,
        "history": [],
        "guided_order_item_id": None,
        "guided_order_item_name": None,
        "guided_order_phase": 1,
        "guided_order_step": 0,
        "guided_order_groups": [],
        "guided_order_required_groups": [],
        "guided_order_optional_groups": [],
        "guided_order_selections": {},
        "guided_order_quantity": None,
        "last_user_message": None,
        "last_bot_response": None,
        "last_matched_items": None,
        "last_action_type": None,
        "last_action_data": None,
        "_schema_version": 1,
        "pending_operations": [],
        "pending_operations_context": {},
    }


def _run_async(awaitable):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(awaitable)

    result_queue: Queue[tuple[bool, Any]] = Queue()

    def _runner() -> None:
        try:
            result_queue.put((True, asyncio.run(awaitable)))
        except Exception as exc:  # pragma: no cover - exercised in sync fallback path
            result_queue.put((False, exc))

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    ok, payload = result_queue.get()
    if ok:
        return payload
    raise payload


def _is_redis_unavailable(exc: Exception) -> bool:
    return isinstance(exc, (RedisError, OSError, TimeoutError))


def _get_redis_client():
    global _redis_client
    if settings.redis_url == "disabled":
        return None
    if redis_async is None:
        return None
    if _redis_client is None:
        _redis_client = redis_async.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


def _to_plain(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _to_plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_to_plain(item) for item in value]
    return value


def _ensure_session_shape(session: dict[str, Any]) -> dict[str, Any]:
    if session.get("_schema_version") != 1:
        session.setdefault("stage", None)
        session.setdefault("checkout_initiated", False)
        session.setdefault("pending_clarification", None)
        session.setdefault("history", [])
        session.setdefault("guided_order_item_id", None)
        session.setdefault("guided_order_item_name", None)
        session.setdefault("guided_order_phase", 1)
        session.setdefault("guided_order_step", 0)
        session.setdefault("guided_order_groups", [])
        session.setdefault("guided_order_required_groups", [])
        session.setdefault("guided_order_optional_groups", [])
        session.setdefault("guided_order_selections", {})
        session.setdefault("guided_order_quantity", None)
        session.setdefault("last_user_message", None)
        session.setdefault("last_bot_response", None)
        session.setdefault("last_matched_items", None)
        session.setdefault("last_action_type", None)
        session.setdefault("last_action_data", None)
        session.setdefault("pending_operations", [])
        session.setdefault("pending_operations_context", {})
        session["_schema_version"] = 1
    return session


class _PersistentList(list):
    def __init__(self, values: list[Any], callback: Callable[[], None]) -> None:
        self._callback = callback
        self._suspended = True
        super().__init__([_wrap_value(value, callback) for value in values])
        self._suspended = False

    def _notify(self) -> None:
        if not self._suspended:
            self._callback()

    def append(self, value: Any) -> None:
        super().append(_wrap_value(value, self._callback))
        self._notify()

    def extend(self, values) -> None:
        super().extend(_wrap_value(value, self._callback) for value in values)
        self._notify()

    def insert(self, index: int, value: Any) -> None:
        super().insert(index, _wrap_value(value, self._callback))
        self._notify()

    def __setitem__(self, index, value) -> None:
        if isinstance(index, slice):
            super().__setitem__(index, [_wrap_value(item, self._callback) for item in value])
        else:
            super().__setitem__(index, _wrap_value(value, self._callback))
        self._notify()

    def __delitem__(self, index) -> None:
        super().__delitem__(index)
        self._notify()

    def pop(self, index: int = -1):
        value = super().pop(index)
        self._notify()
        return value

    def remove(self, value: Any) -> None:
        super().remove(value)
        self._notify()

    def clear(self) -> None:
        super().clear()
        self._notify()

    def sort(self, *args, **kwargs) -> None:
        super().sort(*args, **kwargs)
        self._notify()

    def reverse(self) -> None:
        super().reverse()
        self._notify()


class _PersistentDict(dict):
    def __init__(self, values: dict[str, Any], callback: Callable[[], None]) -> None:
        self._callback = callback
        self._suspended = True
        super().__init__()
        for key, value in values.items():
            super().__setitem__(key, _wrap_value(value, callback))
        self._suspended = False

    def _notify(self) -> None:
        if not self._suspended:
            self._callback()

    def __setitem__(self, key, value) -> None:
        super().__setitem__(key, _wrap_value(value, self._callback))
        self._notify()

    def __delitem__(self, key) -> None:
        super().__delitem__(key)
        self._notify()

    def clear(self) -> None:
        super().clear()
        self._notify()

    def pop(self, key, default=None):
        if key in self:
            value = super().pop(key)
            self._notify()
            return value
        return default

    def popitem(self):
        item = super().popitem()
        self._notify()
        return item

    def setdefault(self, key, default=None):
        if key not in self:
            super().__setitem__(key, _wrap_value(default, self._callback))
            self._notify()
        return super().get(key)

    def update(self, *args, **kwargs) -> None:
        incoming = dict(*args, **kwargs)
        for key, value in incoming.items():
            super().__setitem__(key, _wrap_value(value, self._callback))
        self._notify()


def _wrap_value(value: Any, callback: Callable[[], None]) -> Any:
    if isinstance(value, _PersistentDict) or isinstance(value, _PersistentList):
        return value
    if isinstance(value, dict):
        return _PersistentDict(value, callback)
    if isinstance(value, list):
        return _PersistentList(value, callback)
    return value


def _persist_session(session_id: str) -> None:
    session = sessions.get(session_id)
    if session is None:
        return
    client = _get_redis_client()
    if client is None:
        return
    try:
        _run_async(
            client.set(
                _session_key(session_id),
                json.dumps(_to_plain(session)),
                ex=settings.redis_session_ttl_seconds,
            )
        )
    except Exception as exc:
        if _is_redis_unavailable(exc):
            logger.warning({
                "stage": "session_store_redis_unavailable",
                "session_id": session_id,
                "error": str(exc),
            })
            return
        raise


def _hydrate_session(session_id: str, payload: dict[str, Any]) -> Session:
    raw_session = _ensure_session_shape(payload)

    def _save() -> None:
        _persist_session(session_id)

    session = _PersistentDict(raw_session, _save)
    sessions[session_id] = session  # type: ignore[assignment]
    return session  # type: ignore[return-value]


def _load_session_from_redis(session_id: str) -> Session | None:
    client = _get_redis_client()
    if client is None:
        return None
    try:
        raw_payload = _run_async(
            client.getex(
                _session_key(session_id),
                ex=settings.redis_session_ttl_seconds,
            )
        )
    except Exception as exc:
        if _is_redis_unavailable(exc):
            logger.warning({
                "stage": "session_store_redis_unavailable",
                "session_id": session_id,
                "error": str(exc),
            })
            return None
        raise

    if not raw_payload:
        return None

    try:
        payload = json.loads(raw_payload)
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    return _hydrate_session(session_id, payload)


def get_session(session_id: str) -> Session:
    cached_session = sessions.get(session_id)
    if cached_session is not None:
        if not isinstance(cached_session, _PersistentDict):
            cached_session = _hydrate_session(session_id, dict(cached_session))
        else:
            _ensure_session_shape(cached_session)
        _persist_session(session_id)
        return cached_session

    redis_session = _load_session_from_redis(session_id)
    if redis_session is not None:
        return redis_session

    new_session = _hydrate_session(session_id, _default_session(session_id))
    _persist_session(session_id)
    return new_session


def get_or_create_session(session_id: str | None) -> tuple[str, str | None]:
    if session_id:
        session = get_session(session_id)
        return session_id, session["cart_id"]

    new_session_id = str(uuid.uuid4())
    session = get_session(new_session_id)
    return new_session_id, session["cart_id"]


def set_session_cart_id(session_id: str, cart_id: str | None) -> None:
    session = get_session(session_id)
    session["cart_id"] = cart_id


def get_session_stage(session_id: str) -> str | None:
    session = get_session(session_id)
    return session.get("stage")


def set_session_stage(session_id: str, stage: str | None) -> None:
    session = get_session(session_id)
    session["stage"] = stage


def get_checkout_initiated(session_id: str) -> bool:
    session = get_session(session_id)
    return bool(session.get("checkout_initiated", False))


def set_checkout_initiated(session_id: str, value: bool = True) -> None:
    session = get_session(session_id)
    session["checkout_initiated"] = bool(value)


def update_last_action(
    session_id: str,
    user_message: str,
    bot_response: str,
    action_type: str,
    matched_items: list[dict[str, Any]] | None = None,
    action_data: dict[str, Any] | None = None,
) -> None:
    session = get_session(session_id)
    session["last_user_message"] = user_message
    session["last_bot_response"] = bot_response
    session["last_action_type"] = action_type
    session["last_matched_items"] = matched_items if matched_items is not None else session.get("last_items", [])
    session["last_action_data"] = action_data or {}


def get_guided_order_item_id(session_id: str) -> int | str | None:
    session = get_session(session_id)
    return session.get("guided_order_item_id")


def set_guided_order_item_id(session_id: str, item_id: int | str | None) -> None:
    session = get_session(session_id)
    session["guided_order_item_id"] = item_id


def get_guided_order_item_name(session_id: str) -> str | None:
    session = get_session(session_id)
    return session.get("guided_order_item_name")


def set_guided_order_item_name(session_id: str, item_name: str | None) -> None:
    session = get_session(session_id)
    session["guided_order_item_name"] = item_name


def get_guided_order_phase(session_id: str) -> int:
    session = get_session(session_id)
    return int(session.get("guided_order_phase", 1) or 1)


def set_guided_order_phase(session_id: str, phase: int) -> None:
    session = get_session(session_id)
    session["guided_order_phase"] = int(phase)


def get_guided_order_step(session_id: str) -> int:
    session = get_session(session_id)
    return int(session.get("guided_order_step", 0) or 0)


def set_guided_order_step(session_id: str, step: int) -> None:
    session = get_session(session_id)
    session["guided_order_step"] = int(step)


def get_guided_order_groups(session_id: str) -> list[dict[str, Any]]:
    session = get_session(session_id)
    return list(session.get("guided_order_groups") or [])


def set_guided_order_groups(session_id: str, groups: list[dict[str, Any]]) -> None:
    session = get_session(session_id)
    session["guided_order_groups"] = list(groups or [])


def get_guided_order_required_groups(session_id: str) -> list[dict[str, Any]]:
    session = get_session(session_id)
    return list(session.get("guided_order_required_groups") or [])


def set_guided_order_required_groups(session_id: str, groups: list[dict[str, Any]]) -> None:
    session = get_session(session_id)
    session["guided_order_required_groups"] = list(groups or [])


def get_guided_order_optional_groups(session_id: str) -> list[dict[str, Any]]:
    session = get_session(session_id)
    return list(session.get("guided_order_optional_groups") or [])


def set_guided_order_optional_groups(session_id: str, groups: list[dict[str, Any]]) -> None:
    session = get_session(session_id)
    session["guided_order_optional_groups"] = list(groups or [])


def get_guided_order_selections(session_id: str) -> dict[str, Any]:
    session = get_session(session_id)
    return dict(session.get("guided_order_selections") or {})


def set_guided_order_selections(session_id: str, selections: dict[str, Any]) -> None:
    session = get_session(session_id)
    session["guided_order_selections"] = dict(selections or {})


def get_guided_order_quantity(session_id: str) -> int | None:
    session = get_session(session_id)
    quantity = session.get("guided_order_quantity")
    return int(quantity) if quantity is not None else None


def set_guided_order_quantity(session_id: str, quantity: int | None) -> None:
    session = get_session(session_id)
    session["guided_order_quantity"] = int(quantity) if quantity is not None else None


def clear_guided_order_session(session_id: str) -> None:
    session = get_session(session_id)
    session["guided_order_item_id"] = None
    session["guided_order_item_name"] = None
    session["guided_order_phase"] = 1
    session["guided_order_step"] = 0
    session["guided_order_groups"] = []
    session["guided_order_required_groups"] = []
    session["guided_order_optional_groups"] = []
    session["guided_order_selections"] = {}
    session["guided_order_quantity"] = None


def get_pending_operations(session_id: str) -> list[dict]:
    session = get_session(session_id)
    return list(session.get("pending_operations") or [])


def set_pending_operations(session_id: str, ops: list[dict]) -> None:
    session = get_session(session_id)
    session["pending_operations"] = list(ops or [])


def get_pending_operations_context(session_id: str) -> dict:
    session = get_session(session_id)
    return dict(session.get("pending_operations_context") or {})


def set_pending_operations_context(session_id: str, context: dict) -> None:
    session = get_session(session_id)
    session["pending_operations_context"] = dict(context or {})


def clear_pending_operations(session_id: str) -> None:
    session = get_session(session_id)
    session["pending_operations"] = []
    session["pending_operations_context"] = {}
