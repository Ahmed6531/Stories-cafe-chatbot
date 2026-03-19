# orchestrator.py
import logging

from app.schemas.chat import ChatMessageResponse
from app.utils.normalize import normalize_user_message
from app.services.tools import (
    fetch_menu_items,
    fetch_featured_items,
    get_cart,
    add_item_to_cart,
    find_menu_item_by_name,
    remove_from_cart,
    clear_cart,
)
from app.services.suggestions import suggest_popular_items, suggest_complementary_items
from app.services.http_client import ExpressAPIError

# Default options for smart defaults (SCRUM-91)
DEFAULT_SIZE = "Medium"
DEFAULT_MILK = "Regular"
logger = logging.getLogger(__name__)

def _fmt_price(n) -> str:
    """Format a price as Lebanese Pounds, matching the frontend formatLL utility."""
    return f"L.L {int(n or 0):,}"

def detect_intent(normalized_message: str) -> str:
    """Detects the intent of the user message.
    More-specific phrases are checked before loose single-word keywords to
    prevent accidental keyword matches (e.g. 'order' in 'repeat my last order').
    """
    # checkout: user wants to pay/confirm
    if any(phrase in normalized_message for phrase in [
        "checkout", "place order", "confirm order", "proceed to pay", "i want to pay",
    ]):
        return "checkout"

    # clear entire cart — these phrases must be checked BEFORE the loose "delete"
    # word check below, otherwise "delete my cart" / "delete cart" routes to remove_item
    if any(phrase in normalized_message for phrase in [
        "clear cart", "empty cart", "remove all", "start over", "reset cart",
        "clear my cart", "delete my cart", "empty my cart", "delete cart",
    ]):
        return "clear_cart"

    # remove a specific item (check before add_item to avoid collision)
    if any(word in normalized_message for word in ["remove", "delete", "take out"]):
        return "remove_item"

    # view cart
    if any(phrase in normalized_message for phrase in [
        "show cart", "my cart", "what is in my cart", "view cart", "what's in my cart",
        "whats in my cart",
    ]):
        return "view_cart"

    # recommendations — includes quick-reply chip phrases
    if any(phrase in normalized_message for phrase in [
        "recommend", "suggest", "good today", "what's good", "whats good",
        "surprise", "popular", "what do you have",
    ]):
        return "recommendation_query"

    # "repeat my last order" has 'order' which would wrongly match add_item —
    # guard it here; repeat-order is not yet supported so fall to unknown
    if any(phrase in normalized_message for phrase in ["repeat", "last order"]):
        return "unknown"

    # add item (loose keywords last)
    if any(word in normalized_message for word in ["add", "get", "want", "order"]):
        return "add_item"

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
        remove_from_cart,
        clear_cart,
    )
    from app.services.suggestions import (
        suggest_popular_items,
        suggest_complementary_items,
    )
    from app.services.http_client import ExpressAPIError

    normalized_message = normalize_user_message(message)
    intent = detect_intent(normalized_message)
    logger.info({
        "stage": "intent_detection",
        "normalized_message": normalized_message,
        "intent": intent,
    })

    try:
        if intent == "view_cart":
            cart_result = await get_cart(cart_id=cart_id)
            cart_items = cart_result["cart"]
            if cart_items:
                lines = []
                total = 0.0
                for item in cart_items:
                    qty = item.get("qty", 1)
                    name = item.get("name", "item")
                    price = float(item.get("price", 0))
                    line_total = price * qty
                    total += line_total
                    lines.append(f"• {qty}x {name} — {_fmt_price(price)} each")
                cart_text = "\n".join(lines)
                reply = f"Your cart:\n{cart_text}\n\nTotal: {_fmt_price(total)}"
            else:
                reply = "Your cart is empty."
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply,
                intent=intent,
                cart_updated=False,
                cart_id=cart_result["cart_id"],
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "cart": cart_items,
                    "pipeline_stage": "view_cart_done",
                },
            )

        if intent == "add_item":
            menu_items = await fetch_menu_items()
            item_query, quantity = extract_item_query(normalized_message)

            if quantity <= 0:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="Please specify a quantity of 1 or more.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "invalid_quantity",
                    },
                )

            matched_item = await find_menu_item_by_name(menu_items, item_query)
            item_id = matched_item.get("id") if matched_item else None
            confidence = 1.0 if matched_item else 0.0

            logger.info({
                "stage": "menu_lookup",
                "item_query": item_query,
                "matched_item_id": item_id,
                "confidence": confidence,
            })

            if not matched_item:
                logger.warning({
                    "stage": "menu_lookup_failed",
                    "query": item_query,
                })
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

            menu_item_id = item_id
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

            logger.info({
                "stage": "cart_operation",
                "operation": "add_item",
                "menu_item_id": menu_item_id,
                "qty": quantity,
                "session_id": session_id,
            })
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
            # Build cart summary with prices
            cart_items = cart_result["cart"]

            cart_lines = []
            for item in cart_items:
                qty = item.get("qty", 1)
                name = item.get("name", "item")
                price = float(item.get("price", 0))
                cart_lines.append(f"• {qty}x {name} — {_fmt_price(price)} each")

            cart_summary = "\n".join(cart_lines)

            # Per-item price for the confirmation line
            added_price = float(matched_item.get("basePrice", matched_item.get("price", 0)))
            price_note = f" ({_fmt_price(added_price)})" if added_price else ""

            reply_text = (
                f"Added {quantity}x {matched_item.get('name')}{price_note} to your cart.\n\n"
                f"Your cart:\n"
                f"{cart_summary}"
            )

            if filtered_suggestions:
                reply_text += "\n\nYou might also like:"
                        
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

        if intent == "remove_item":
            cart_result = await get_cart(cart_id=cart_id)
            cart_items = cart_result["cart"]
            item_query, _ = extract_item_query(normalized_message)

            matched_line = None
            if item_query:
                # Strip intent verbs that extract_item_query leaves in the query
                # e.g. "remove filtered coffee" → "filtered coffee"
                _intent_words = {"remove", "delete", "take", "out"}
                clean_query = " ".join(
                    t for t in item_query.lower().split() if t not in _intent_words
                ).strip()
                for line in cart_items:
                    cart_name = line.get("name", "").lower()
                    if clean_query and (clean_query in cart_name or cart_name in clean_query):
                        matched_line = line
                        break

            if not matched_line:
                if not cart_items:
                    reply = "Your cart is already empty."
                else:
                    reply = f"I couldn't find '{item_query}' in your cart."
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=reply,
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "remove_item_not_found",
                    },
                )

            line_id = str(matched_line.get("lineId", ""))
            remove_result = await remove_from_cart(line_id=line_id, cart_id=cart_result["cart_id"])
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=f"Removed {matched_line.get('name')} from your cart.",
                intent=intent,
                cart_updated=True,
                cart_id=remove_result["cart_id"],
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "removed_item": matched_line.get("name"),
                    "pipeline_stage": "remove_item_done",
                },
            )

        if intent == "clear_cart":
            await clear_cart(cart_id=cart_id)
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply="Your cart has been cleared.",
                intent=intent,
                cart_updated=True,
                cart_id=None,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "clear_cart_done",
                },
            )

        if intent == "checkout":
            cart_result = await get_cart(cart_id=cart_id)
            if not cart_result["cart"]:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="Your cart is empty. Add some items first, then head to checkout.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "checkout_empty_cart",
                    },
                )
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply="Ready to checkout! Head to the checkout page to enter your details and place your order.",
                intent=intent,
                cart_updated=False,
                cart_id=cart_result["cart_id"],
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "checkout_redirect",
                },
            )

        if intent == "recommendation_query":
            featured_items = await fetch_featured_items()
            suggestions = suggest_popular_items(featured_items)
            reply = "Here are some items you might like!"
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply,
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
