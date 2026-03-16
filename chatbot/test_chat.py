import asyncio
from app.services.orchestrator import process_chat_message

async def test():
    session_id = "test123"
    cart_id = None
    message = "I want 2 iced lattes"
    response = await process_chat_message(session_id, message, cart_id)
    print(response)

asyncio.run(test())