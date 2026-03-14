from app.schemas.chat import ChatMessageResponse
from app.utils.normalize import normalize_user_message
from app.services.tools import (
    fetch_menu_items,
    fetch_featured_items,
    get_cart,
    add_item_to_cart,
    find_menu_item_by_name,
)
from app.services.suggestions import (
    suggest_popular_items,
    suggest_complementary_items,
)
from app.services.http_client import ExpressAPIError


def detect_intent(normalized_message: str) -> str:
    if any(word in normalized_message for word in ["add", "get", "want", "order"]):
        return "add_item"

    if any(word in normalized_message for word in ["remove", "delete"]):
        return "remove_item"

    if any(phrase in normalized_message for phrase in ["show cart", "my cart", "what is in my cart"]):
        return "view_cart"

    if any(phrase in normalized_message for phrase in ["recommend", "suggest"]):
        return "recommendation_query"

    return "unknown"


def extract_item_query(normalized_message: str) -> str:
    filler_words = {
        "add", "a", "an", "the", "i", "want", "get", "order", "please", "me"
    }
    tokens = [token for token in normalized_message.split() if token not in filler_words]
    return " ".join(tokens).strip()


async def process_chat_message(
    session_id: str,
    message: str,
    cart_id: str | None = None,
) -> ChatMessageResponse:
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
            item_query = extract_item_query(normalized_message)
            matched_item = find_menu_item_by_name(menu_items, item_query)

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
                menu_item_id = matched_item.get("_id")

            print("MATCHED MENU ITEM:", matched_item)
            print("USING MENU ITEM ID:", menu_item_id)

            if menu_item_id is None:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="error",
                    reply="I found the menu item, but its ID is missing.",
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
                qty=1,
                selected_options=[],
                instructions="",
                cart_id=cart_id,
            )

            featured_items = await fetch_featured_items()
            popular = suggest_popular_items(featured_items)
            complementary = suggest_complementary_items(menu_items, matched_item)

            suggestions = popular + complementary

            filtered_suggestions = [
                suggestion
                for suggestion in suggestions
                if suggestion.get("item_name", "").lower()
                != matched_item.get("name", "").lower()
            ]

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=f"Added {matched_item.get('name', 'item')} to your cart.",
                intent=intent,
                cart_updated=True,
                cart_id=cart_result["cart_id"],
                defaults_used=[],
                suggestions=filtered_suggestions,
                metadata={
                    "normalized_message": normalized_message,
                    "item_query": item_query,
                    "matched_item": matched_item,
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
