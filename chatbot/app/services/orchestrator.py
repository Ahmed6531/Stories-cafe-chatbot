# orchestrator.py
from app.schemas.chat import ChatMessageResponse
from app.utils.normalize import normalize_user_message
from app.services.tools import (
    fetch_menu_items,
    fetch_featured_items,
    get_cart,
    add_item_to_cart,
    find_menu_item_by_name,
)
from app.services.suggestions import suggest_popular_items, suggest_complementary_items
from app.services.http_client import ExpressAPIError

# Default options for smart defaults (SCRUM-91)
DEFAULT_SIZE = "Medium"
DEFAULT_MILK = "Regular"

def detect_intent(normalized_message: str) -> str:
    """Detects the intent of the user message"""
    if any(word in normalized_message for word in ["add", "get", "want", "order"]):
        return "add_item"
    if any(word in normalized_message for word in ["remove", "delete"]):
        return "remove_item"
    if any(phrase in normalized_message for phrase in ["show cart", "my cart", "what is in my cart"]):
        return "view_cart"
    if any(phrase in normalized_message for phrase in ["recommend", "suggest"]):
        return "recommendation_query"
    return "unknown"

def extract_item_query(normalized_message: str) -> tuple[str, int]:
    """
    Extracts item name and quantity from normalized message.
    Returns (item_name, quantity)
    """
    word_to_number = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        "eleven": 11, "twelve": 12, "dozen": 12
    }
    
    filler_words = {"add", "a", "an", "the", "i", "want", "get", "order", "please", "me"}
    tokens = normalized_message.split()
    quantity = 1
    item_tokens = []

    for token in tokens:
        if token.isdigit():
            quantity = int(token)
        elif token in word_to_number:
            quantity = word_to_number[token]
        elif token not in filler_words:
            item_tokens.append(token)

    item_name = " ".join(item_tokens).strip()
    return item_name, quantity


def normalize_item_name(name: str) -> str:
    """
    Lowercase and remove simple plurals for matching.
    'Iced Lattes' -> 'iced latte'
    """
    name = name.lower().strip()
    if name.endswith("s"):
        name = name[:-1]
    return name


async def find_menu_item_by_name(menu_items: list[dict], item_query: str) -> dict | None:
    normalized_query = normalize_item_name(item_query)
    for item in menu_items:
        menu_item_name = normalize_item_name(item.get("name", item.get("title", "")))
        if normalized_query in menu_item_name or menu_item_name in normalized_query:
            return item
    return None

def apply_smart_defaults(item: dict) -> dict:
    """Apply default size/milk if missing and return defaults used"""
    defaults_used = []
    if "size" not in item or not item.get("size"):
        item["size"] = DEFAULT_SIZE
        defaults_used.append(f"size={DEFAULT_SIZE}")
    if "milk" not in item or not item.get("milk"):
        item["milk"] = DEFAULT_MILK
        defaults_used.append(f"milk={DEFAULT_MILK}")
    return item, defaults_used

async def process_chat_message(
    session_id: str,
    message: str,
    cart_id: str | None = None,
) -> ChatMessageResponse:
    from app.utils.normalize import normalize_user_message
    from app.services.tools import (
        fetch_menu_items,
        fetch_featured_items,
        get_cart,
        add_item_to_cart,
    )
    from app.services.suggestions import (
        suggest_popular_items,
        suggest_complementary_items,
    )
    from app.services.http_client import ExpressAPIError

    normalized_message = normalize_user_message(message)
    intent = detect_intent(normalized_message)

    try:
        if intent == "view_cart":
            cart_result = await get_cart(cart_id=cart_id)
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply="Here is your current cart.",
                intent=intent,
                cart_updated=False,
                cart_id=cart_result["cart_id"],
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "cart": cart_result["cart"],
                    "pipeline_stage": "view_cart_done",
                },
            )

        if intent == "add_item":
            menu_items = await fetch_menu_items()
            item_query, quantity = extract_item_query(normalized_message)
            matched_item = await find_menu_item_by_name(menu_items, item_query)

            if not matched_item:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=f"I could not find '{item_query}' on the menu.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "item_query": item_query,
                        "pipeline_stage": "menu_match_failed",
                    },
                )

            menu_item_id = matched_item.get("id")
            if menu_item_id is None:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="error",
                    reply="I found the menu item, but its numeric ID is missing.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "matched_item": matched_item,
                        "pipeline_stage": "menu_item_id_missing",
                    },
                )

            cart_result = await add_item_to_cart(
                menu_item_id=menu_item_id,
                qty=quantity,
                selected_options=[],
                instructions="",
                cart_id=cart_id,
            )

            featured_items = await fetch_featured_items()
            popular = suggest_popular_items(featured_items)
            complementary = suggest_complementary_items(menu_items, matched_item)

            suggestions = popular + complementary
            filtered_suggestions = [
                s for s in suggestions
                if s.get("item_name", "").lower() != matched_item.get("name", "").lower()
            ]
            # Build cart summary
            cart_items = cart_result["cart"]

            cart_lines = []
            for item in cart_items:
                qty = item.get("qty", 1)
                name = item.get("name", "item")
                cart_lines.append(f"• {qty}x {name}")

            cart_summary = "\n".join(cart_lines)

            # Build suggestion text
            suggestion_lines = []
            for s in filtered_suggestions:
                suggestion_lines.append(f"• {s['item_name']}")

            suggestion_text = "\n".join(suggestion_lines)

            reply_text = (
                f"Added {quantity} {matched_item.get('name')} to your cart.\n\n"
                f"Your cart now contains:\n"
                f"{cart_summary}"
            )

            if suggestion_lines:
                reply_text += f"\n\nYou might also like:\n{suggestion_text}"
                        
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent=intent,
                cart_updated=True,
                cart_id=cart_result["cart_id"],
                defaults_used=[],
                suggestions=filtered_suggestions,
                metadata={
                    "normalized_message": normalized_message,
                    "item_query": item_query,
                    "matched_item": matched_item,
                    "quantity": quantity,
                    "cart": cart_result["cart"],
                    "pipeline_stage": "add_item_done",
                },
            )

        if intent == "recommendation_query":
            featured_items = await fetch_featured_items()
            suggestions = suggest_popular_items(featured_items)
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply="Here are some popular items you might like.",
                intent=intent,
                cart_updated=False,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=suggestions,
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "recommendation_done",
                },
            )

        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply=f"I understood your message: '{normalized_message}'.",
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "pipeline_stage": "unknown_intent",
            },
        )

    except ExpressAPIError as e:
        return ChatMessageResponse(
            session_id=session_id,
            status="error",
            reply="I could not reach the cafe backend service.",
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "error": str(e),
                "pipeline_stage": "express_api_error",
            },
        )
    except Exception as e:
        return ChatMessageResponse(
            session_id=session_id,
            status="error",
            reply="Something went wrong while processing your request.",
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "error": str(e),
                "pipeline_stage": "unexpected_error",
            },
        )
