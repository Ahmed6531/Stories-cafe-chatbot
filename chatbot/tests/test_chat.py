import pytest
from httpx import AsyncClient
from chatbot.main import app

@pytest.mark.asyncio
async def test_add_to_cart_confirmation_only():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        resp = await ac.post("/chat", json={"session_id": "s1", "message": "add coffee"})
        assert resp.status_code == 200
        data = resp.json()
        assert "Added coffee to your cart." in data["reply"]

@pytest.mark.asyncio
async def test_add_to_cart_with_upsell():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        resp = await ac.post("/chat", json={"session_id": "s2", "message": "add latte"})
        data = resp.json()
        assert "Added latte to your cart." in data["reply"]
        assert "croissant" in data["reply"]

@pytest.mark.asyncio
async def test_add_to_cart_no_match():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        resp = await ac.post("/chat", json={"session_id": "s3", "message": "add salad"})
        data = resp.json()
        assert "Added salad to your cart." in data["reply"]
        assert "Would you like" not in data["reply"]

@pytest.mark.asyncio
async def test_upsell_not_repeated():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # First upsell
        resp1 = await ac.post("/chat", json={"session_id": "s4", "message": "add coffee"})
        assert "croissant" in resp1.json()["reply"]
        # Second upsell should not repeat croissant
        resp2 = await ac.post("/chat", json={"session_id": "s4", "message": "add coffee"})
        assert "croissant" not in resp2.json()["reply"]

@pytest.mark.asyncio
async def test_non_add_intent_no_upsell():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        resp = await ac.post("/chat", json={"session_id": "s5", "message": "show menu"})
        data = resp.json()
        assert "Would you like" not in data["reply"]
