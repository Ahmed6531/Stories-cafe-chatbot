import re
import httpx

from app.schemas.chat import ChatMessageResponse
from app.services.llm_interpreter import try_interpret_message, _extract_add_items_from_message
from app.services.session_store import Session


def detect_special_command(message: str) -> str | None:
    message = message.lower()

    if any(phrase in message for phrase in ["clear cart", "remove all", "empty cart"]):
        return "clear_cart"

    return None


def has_mixed_intent(message: str) -> bool:
    message = message.lower()
    has_add = bool(
        re.search(
            r"\b(add|get|order)\b|want to (?:add|order)|would like to (?:add|order)",
            message,
        )
    )
    has_remove = bool(re.search(r"\b(remove|delete)\b", message))
    has_update = bool(re.search(r"\b(set|update)\b", message)) or (
        any(char.isdigit() for char in message)
        and bool(re.search(r"\b(change|make)\b", message))
    )

    return sum([has_add, has_remove, has_update]) > 1


def detect_intent(message: str) -> str:
    message = message.lower()
    has_digit = any(char.isdigit() for char in message)

    if any(word in message for word in ["remove", "delete"]):
        return "remove_item"
    if "set" in message or "update" in message:
        return "update_quantity"
    if has_digit and any(word in message for word in ["change", "make"]):
        return "update_quantity"
    if "cart" in message:
        return "view_cart"
    if any(word in message for word in ["add", "get", "order", "want"]):
        return "add_items"

    return "unknown"


def extract_item_query(message: str, default_quantity: int | None = 1):
    message = message.lower()

    words = message.split()
    quantity = default_quantity

    for word in words:
        if word.isdigit():
            quantity = int(word)

    ignore_words = {
        "a",
        "add",
        "an",
        "cart",
        "change",
        "delete",
        "from",
        "get",
        "i",
        "it",
        "make",
        "me",
        "my",
        "only",
        "order",
        "please",
        "quantity",
        "remove",
        "set",
        "the",
        "to",
        "update",
        "want",
    }

    item_words = [w for w in words if w not in ignore_words and not w.isdigit()]
    item_query = " ".join(item_words)

    return item_query, quantity


def extract_requested_items(interpretation: dict) -> list[dict]:
    items = interpretation.get("items")
    normalized_items = []
    default_quantity = 1 if interpretation.get("intent") in {"add_item", "add_items"} else None

    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue

            item_name = (item.get("item_name") or "").strip()
            if not item_name:
                continue

            quantity = item.get("quantity")
            if quantity is None and default_quantity is not None:
                quantity = default_quantity

            normalized_items.append(
                {
                    "item_name": item_name,
                    "quantity": quantity,
                    "size": item.get("size"),
                    "options": item.get("options")
                    if isinstance(item.get("options"), dict)
                    else {"milk": None, "sugar": None},
                }
            )

    if normalized_items:
        return normalized_items

    legacy_item_name = (interpretation.get("item_name") or "").strip()
    if not legacy_item_name:
        return []

    legacy_quantity = interpretation.get("quantity")
    if legacy_quantity is None and default_quantity is not None:
        legacy_quantity = default_quantity

    return [
        {
            "item_name": legacy_item_name,
            "quantity": legacy_quantity,
            "size": interpretation.get("size"),
            "options": interpretation.get("options")
            if isinstance(interpretation.get("options"), dict)
            else {"milk": None, "sugar": None},
        }
    ]


def resolve_requested_items_from_session(
    intent: str,
    requested_items: list[dict],
    interpretation: dict,
    session: Session | None,
) -> list[dict]:
    if session is None or intent not in {"update_quantity", "remove_item"}:
        return requested_items

    session_items = session.get("last_items")
    if not isinstance(session_items, list) or not session_items:
        return requested_items

    session_item = session_items[0]
    if not isinstance(session_item, dict):
        return requested_items

    session_item_name = (session_item.get("item_name") or "").strip()
    if not session_item_name:
        return requested_items

    if requested_items:
        current_item = requested_items[0]
        if (current_item.get("item_name") or "").strip():
            return requested_items
    else:
        raw_items = interpretation.get("items")
        if isinstance(raw_items, list) and raw_items:
            current_item = raw_items[0] if isinstance(raw_items[0], dict) else {}
        else:
            current_item = {
                "item_name": interpretation.get("item_name"),
                "quantity": interpretation.get("quantity"),
                "size": interpretation.get("size"),
                "options": interpretation.get("options"),
            }

        if (current_item.get("item_name") or "").strip():
            return requested_items

    current_quantity = current_item.get("quantity")
    current_size = current_item.get("size")
    current_options = current_item.get("options")
    session_options = session_item.get("options")
    options = current_options if isinstance(current_options, dict) else session_options
    if not isinstance(options, dict):
        options = {"milk": None, "sugar": None}

    return [
        {
            "item_name": session_item_name,
            "quantity": current_quantity if current_quantity is not None else (
                session_item.get("quantity") if intent == "remove_item" else None
            ),
            "size": current_size if current_size is not None else session_item.get("size"),
            "options": options,
        }
    ]


def resolve_add_items_from_session(
    requested_items: list[dict],
    interpretation: dict,
    session: Session | None,
) -> list[dict]:
    if session is None or not interpretation.get("fallback_needed", False):
        return requested_items

    follow_up_item_names = {"same one", "another one", "one more", "more", "another"}

    if requested_items:
        current_item = requested_items[0]
        current_item_name = (current_item.get("item_name") or "").strip().lower()
        if current_item_name and current_item_name not in follow_up_item_names:
            return requested_items
    else:
        raw_items = interpretation.get("items")
        if isinstance(raw_items, list) and raw_items:
            current_item = raw_items[0] if isinstance(raw_items[0], dict) else {}
        else:
            current_item = {
                "item_name": interpretation.get("item_name"),
                "quantity": interpretation.get("quantity"),
            }

        current_item_name = (current_item.get("item_name") or "").strip().lower()
        current_quantity = current_item.get("quantity")
        if current_quantity is None:
            current_quantity = interpretation.get("quantity")

        if (
            current_item_name
            and current_item_name not in follow_up_item_names
            and current_quantity is None
        ):
            return requested_items

    session_items = session.get("last_items")
    if not isinstance(session_items, list) or not session_items:
        return requested_items

    session_item = session_items[0]
    if not isinstance(session_item, dict):
        return requested_items

    session_item_name = (session_item.get("item_name") or "").strip()
    if not session_item_name:
        return requested_items

    session_options = session_item.get("options")
    options = session_options if isinstance(session_options, dict) else {"milk": None, "sugar": None}
    quantity = current_item.get("quantity")
    if quantity is None:
        quantity = interpretation.get("quantity")
    if quantity is None:
        quantity = 1

    return [
        {
            "item_name": session_item_name,
            "quantity": quantity,
            "size": session_item.get("size"),
            "options": options,
        }
    ]


def is_invalid_fallback_query(item_query: str) -> bool:
    if not item_query:
        return True

    words = item_query.split()
    return len(words) > 6


def validate_requested_items(
    message: str,
    intent: str,
    requested_items: list[dict],
    fallback_needed: bool,
) -> bool:
    if has_mixed_intent(message):
        return False

    if intent in {"add_item", "add_items"}:
        if not requested_items:
            return False

        if any(not (item.get("item_name") or "").strip() for item in requested_items):
            return False

        if any((item.get("quantity") or 0) < 1 for item in requested_items):
            return False

        if any(" and " in (item.get("item_name") or "").lower() for item in requested_items):
            return False

        if fallback_needed and any(is_invalid_fallback_query(item.get("item_name", "")) for item in requested_items):
            return False

    if intent in {"update_quantity", "remove_item"}:
        if not requested_items:
            return False
        if not (requested_items[0].get("item_name") or "").strip():
            return False
        if len(requested_items) > 1:
            return False

    return True


def build_cart_summary(cart_items: list[dict]) -> str:
    cart_lines = []

    for item in cart_items:
        qty = item.get("qty", 1)
        name = item.get("name", "item")
        cart_lines.append(f"- {qty}x {name}")

    return "\n".join(cart_lines)


async def process_chat_message(
    session_id: str,
    message: str,
    cart_id: str | None = None,
    session: Session | None = None,
) -> ChatMessageResponse:

    from app.utils.normalize import normalize_user_message
    from app.services.tools import (
        add_item_to_cart,
        clear_cart,
        fetch_featured_items,
        fetch_menu_items,
        find_menu_item_by_name,
        get_cart,
        remove_item_from_cart,
        update_cart_item_quantity,
    )
    from app.services.suggestions import (
        suggest_complementary_items,
        suggest_popular_items,
    )
    from app.services.http_client import ExpressAPIError

    if session is not None and cart_id is None:
        cart_id = session["cart_id"]

    normalized_message = normalize_user_message(message)
    special_command = detect_special_command(normalized_message)
    fallback_intent = detect_intent(normalized_message)

    if special_command == "clear_cart":
        interpretation = {
            "intent": special_command,
            "items": [],
            "confidence": 1.0,
            "fallback_needed": False,
        }
        intent = special_command
    else:
        llm_result = try_interpret_message(normalized_message)

        if llm_result and not llm_result.get("fallback_needed", True):
            interpretation = llm_result
            intent = interpretation.get("intent", "unknown")

            if fallback_intent in {"remove_item", "update_quantity"} and intent == "add_items":
                interpretation["intent"] = fallback_intent
                intent = fallback_intent
        else:
            intent = fallback_intent
            
            if fallback_intent == "add_items":
                fallback_items = _extract_add_items_from_message(normalized_message)
            else:
                default_quantity = 1 if fallback_intent == "add_items" else None
                item_query, quantity = extract_item_query(
                    normalized_message,
                    default_quantity=default_quantity,
                )
                fallback_items = []
                if item_query:
                    fallback_items.append(
                        {
                            "item_name": item_query,
                            "quantity": quantity,
                            "size": None,
                            "options": {
                                "milk": None,
                                "sugar": None,
                            },
                        }
                    )

            interpretation = {
                "intent": fallback_intent,
                "items": fallback_items,
                "confidence": 0.0,
                "fallback_needed": True,
            }
            intent = interpretation["intent"]

    try:
        if intent in {"add_item", "add_items", "update_quantity", "remove_item"} and has_mixed_intent(normalized_message):
            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply="I didn't understand that. Can you clarify?",
                intent="unknown",
                cart_updated=False,
                cart_id=cart_id,
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "pipeline_stage": "mixed_intent_detected",
                },
            )

        if intent == "clear_cart":
            cart_result = await clear_cart(cart_id=cart_id)

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply="Your cart is now empty.",
                intent=intent,
                cart_updated=True,
                cart_id=cart_result["cart_id"],
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "cart": cart_result["cart"],
                    "pipeline_stage": "clear_cart_done",
                },
            )

        if intent == "view_cart":
            cart_result = await get_cart(cart_id=cart_id)
            cart_summary = build_cart_summary(cart_result["cart"])

            if cart_summary:
                reply_text = f"Here is your current cart:\n{cart_summary}"
            else:
                reply_text = "Your cart is empty."

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
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

        if intent == "update_quantity":
            cart_result = await get_cart(cart_id=cart_id)
            requested_items = extract_requested_items(interpretation)
            requested_items = resolve_requested_items_from_session(
                intent,
                requested_items,
                interpretation,
                session,
            )
            if not validate_requested_items(
                normalized_message,
                intent,
                requested_items,
                interpretation.get("fallback_needed", False),
            ):
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="I didn't understand that. Can you clarify?",
                    intent="unknown",
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "pipeline_stage": "update_validation_failed",
                    },
                )

            target_item = requested_items[0] if requested_items else {}
            item_query = target_item.get("item_name")
            quantity = target_item.get("quantity")

            if not item_query:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="Please tell me which item in your cart you'd like to update.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "update_item_missing",
                    },
                )

            if quantity is None or quantity < 1:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=f"What quantity should I set for {item_query}?",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "pipeline_stage": "update_quantity_missing",
                    },
                )

            matched_cart_item = await find_menu_item_by_name(cart_result["cart"], item_query)
            if not matched_cart_item:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=f"I couldn't find {item_query} in your cart.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "cart": cart_result["cart"],
                        "pipeline_stage": "cart_item_not_found",
                    },
                )

            line_id = matched_cart_item.get("lineId") or matched_cart_item.get("_id")
            if line_id is None:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="error",
                    reply="I found the item in your cart, but I couldn't update it right now.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "matched_item": matched_cart_item,
                        "pipeline_stage": "cart_line_id_missing",
                    },
                )

            updated_cart_result = await update_cart_item_quantity(
                line_id=line_id,
                qty=quantity,
                cart_id=cart_result["cart_id"],
            )
            cart_summary = build_cart_summary(updated_cart_result["cart"])
            reply_text = f"Updated {matched_cart_item.get('name', item_query)} to quantity {quantity}."

            if cart_summary:
                reply_text += f"\n\nYour cart now contains:\n{cart_summary}"

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent=intent,
                cart_updated=True,
                cart_id=updated_cart_result["cart_id"],
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "requested_items": requested_items,
                    "matched_item": matched_cart_item,
                    "cart": updated_cart_result["cart"],
                    "pipeline_stage": "update_quantity_done",
                },
            )

        if intent == "remove_item":
            cart_result = await get_cart(cart_id=cart_id)
            requested_items = extract_requested_items(interpretation)
            requested_items = resolve_requested_items_from_session(
                intent,
                requested_items,
                interpretation,
                session,
            )
            if not validate_requested_items(
                normalized_message,
                intent,
                requested_items,
                interpretation.get("fallback_needed", False),
            ):
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="I didn't understand that. Can you clarify?",
                    intent="unknown",
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "pipeline_stage": "remove_validation_failed",
                    },
                )

            target_item = requested_items[0] if requested_items else {}
            item_query = target_item.get("item_name")
            quantity = target_item.get("quantity")

            if not item_query:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="Please tell me which item you'd like to remove from your cart.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "remove_item_missing",
                    },
                )

            matched_cart_item = await find_menu_item_by_name(cart_result["cart"], item_query)
            if not matched_cart_item:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=f"I couldn't find {item_query} in your cart.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "cart": cart_result["cart"],
                        "pipeline_stage": "cart_item_not_found",
                    },
                )

            line_id = matched_cart_item.get("lineId") or matched_cart_item.get("_id")
            if line_id is None:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="error",
                    reply="I found the item in your cart, but I couldn't remove it right now.",
                    intent=intent,
                    cart_updated=False,
                    cart_id=cart_result["cart_id"],
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "matched_item": matched_cart_item,
                        "pipeline_stage": "cart_line_id_missing",
                    },
                )

            current_qty = matched_cart_item.get("qty") or 0

            if quantity and quantity > 0 and current_qty > quantity:
                updated_cart_result = await update_cart_item_quantity(
                    line_id=line_id,
                    qty=current_qty - quantity,
                    cart_id=cart_result["cart_id"],
                )
                cart_summary = build_cart_summary(updated_cart_result["cart"])
                reply_text = (
                    f"Removed {quantity} {matched_cart_item.get('name', item_query)} from your cart."
                )
            else:
                updated_cart_result = await remove_item_from_cart(
                    line_id=line_id,
                    cart_id=cart_result["cart_id"],
                )
                cart_summary = build_cart_summary(updated_cart_result["cart"])
                reply_text = f"Removed {matched_cart_item.get('name', item_query)} from your cart."

            if cart_summary:
                reply_text += f"\n\nYour cart now contains:\n{cart_summary}"
            else:
                reply_text += "\n\nYour cart is now empty."

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent=intent,
                cart_updated=True,
                cart_id=updated_cart_result["cart_id"],
                defaults_used=[],
                suggestions=[],
                metadata={
                    "normalized_message": normalized_message,
                    "requested_items": requested_items,
                    "matched_item": matched_cart_item,
                    "cart": updated_cart_result["cart"],
                    "pipeline_stage": "remove_item_done",
                },
            )

        if intent in {"add_item", "add_items"}:
            menu_items = await fetch_menu_items()
            requested_items = extract_requested_items(interpretation)
            requested_items = resolve_add_items_from_session(
                requested_items,
                interpretation,
                session,
            )
            if not validate_requested_items(
                normalized_message,
                intent,
                requested_items,
                interpretation.get("fallback_needed", False),
            ):
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="I didn't understand that. Can you clarify?",
                    intent="unknown",
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "pipeline_stage": "add_validation_failed",
                    },
                )

            if not requested_items:
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="I'm not sure what item you'd like to add.",
                    intent="add_items",
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "pipeline_stage": "add_items_missing",
                    },
                )

            if interpretation.get("fallback_needed") and any(
                is_invalid_fallback_query(item.get("item_name", ""))
                for item in requested_items
            ):
                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply="I didn't understand that. Can you clarify?",
                    intent="unknown",
                    cart_updated=False,
                    cart_id=cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "pipeline_stage": "fallback_query_invalid",
                    },
                )

            successful_items = []
            failed_items = []
            last_matched_item = None
            cart_result = None
            current_cart_id = cart_id

            for requested_item in requested_items:
                item_query = requested_item.get("item_name")
                quantity = requested_item.get("quantity") or 1

                matched_item = await find_menu_item_by_name(menu_items, item_query or "")
                if not matched_item:
                    failed_items.append(item_query)
                    continue

                menu_item_id = matched_item.get("id") or matched_item.get("_id")
                if menu_item_id is None:
                    failed_items.append(item_query or matched_item.get("name", "item"))
                    continue

                cart_result = await add_item_to_cart(
                    menu_item_id=menu_item_id,
                    qty=quantity,
                    selected_options=[],
                    instructions="",
                    cart_id=current_cart_id,
                )
                current_cart_id = cart_result["cart_id"]
                last_matched_item = matched_item
                successful_items.append(
                    {
                        "requested_name": item_query,
                        "matched_name": matched_item.get("name", "item"),
                        "quantity": quantity,
                        "matched_item": matched_item,
                    }
                )

            if not successful_items:
                if interpretation.get("fallback_needed"):
                    return ChatMessageResponse(
                        session_id=session_id,
                        status="ok",
                        reply="I didn't understand that. Can you clarify?",
                        intent="unknown",
                        cart_updated=False,
                        cart_id=current_cart_id,
                        defaults_used=[],
                        suggestions=[],
                        metadata={
                            "normalized_message": normalized_message,
                            "requested_items": requested_items,
                            "failed_items": failed_items,
                            "pipeline_stage": "fallback_query_unmatched",
                        },
                    )

                if len(failed_items) == 1:
                    reply_text = f"I could not find '{failed_items[0]}' on the menu."
                else:
                    failed_lines = [f"- {item}" for item in failed_items if item]
                    reply_text = "I could not find these items on the menu."
                    if failed_lines:
                        reply_text += "\n" + "\n".join(failed_lines)

                return ChatMessageResponse(
                    session_id=session_id,
                    status="ok",
                    reply=reply_text,
                    intent="add_items",
                    cart_updated=False,
                    cart_id=current_cart_id,
                    defaults_used=[],
                    suggestions=[],
                    metadata={
                        "normalized_message": normalized_message,
                        "requested_items": requested_items,
                        "failed_items": failed_items,
                        "pipeline_stage": "menu_match_failed",
                    },
                )

            featured_items = await fetch_featured_items()
            popular = suggest_popular_items(featured_items)
            complementary = suggest_complementary_items(menu_items, last_matched_item)

            suggestions = popular + complementary
            added_item_names = {item["matched_name"].lower() for item in successful_items}

            filtered_suggestions = [
                s for s in suggestions
                if s.get("item_name", "").lower() not in added_item_names
            ]

            cart_summary = build_cart_summary(cart_result["cart"])
            suggestion_lines = [f"- {s['item_name']}" for s in filtered_suggestions]
            suggestion_text = "\n".join(suggestion_lines)

            if len(successful_items) == 1 and not failed_items:
                added_item = successful_items[0]
                reply_text = (
                    f"Added {added_item['quantity']} {added_item['matched_name']} to your cart.\n\n"
                    f"Your cart now contains:\n{cart_summary}"
                )
            else:
                added_lines = [
                    f"- {item['quantity']}x {item['matched_name']}"
                    for item in successful_items
                ]
                reply_parts = [
                    "Added these items to your cart:\n" + "\n".join(added_lines)
                ]

                if failed_items:
                    failed_lines = [f"- {item}" for item in failed_items if item]
                    if failed_lines:
                        reply_parts.append(
                            "I could not find these items on the menu:\n"
                            + "\n".join(failed_lines)
                        )

                if cart_summary:
                    reply_parts.append(f"Your cart now contains:\n{cart_summary}")

                reply_text = "\n\n".join(reply_parts)

            if suggestion_lines:
                reply_text += f"\n\nYou might also like:\n{suggestion_text}"

            return ChatMessageResponse(
                session_id=session_id,
                status="ok",
                reply=reply_text,
                intent="add_items",
                cart_updated=True,
                cart_id=current_cart_id,
                defaults_used=[],
                suggestions=filtered_suggestions,
                metadata={
                    "normalized_message": normalized_message,
                    "requested_items": requested_items,
                    "added_items": successful_items,
                    "failed_items": failed_items,
                    "cart": cart_result["cart"],
                    "pipeline_stage": "add_items_done",
                },
            )

        return ChatMessageResponse(
            session_id=session_id,
            status="ok",
            reply="I'm not sure how to help with that yet.",
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "pipeline_stage": "fallback_response",
            },
        )

    except (ExpressAPIError, httpx.RequestError) as e:
        return ChatMessageResponse(
            session_id=session_id,
            status="error",
            reply="I'm having trouble reaching the cafe system right now. Please try again in a moment.",
            intent=intent,
            cart_updated=False,
            cart_id=cart_id,
            defaults_used=[],
            suggestions=[],
            metadata={
                "normalized_message": normalized_message,
                "error": str(e),
                "pipeline_stage": "backend_unavailable",
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
