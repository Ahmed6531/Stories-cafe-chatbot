import pytest


@pytest.fixture(autouse=True)
def disable_redis_session_store(monkeypatch):
    """Use in-memory sessions in tests so local Redis availability never affects results."""
    import app.services.session_store as session_store

    monkeypatch.setattr(session_store.settings, "redis_url", "disabled")
    monkeypatch.setattr(session_store, "_redis_client", None)
