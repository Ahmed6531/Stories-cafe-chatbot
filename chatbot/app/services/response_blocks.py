from __future__ import annotations

from typing import Any


def plain_text_block(text: str) -> dict[str, Any]:
    return {
        "type": "plain_text",
        "text": str(text or ""),
    }


def cart_confirmation_block(
    *,
    text: str,
    item_name: str | None = None,
    defaults_used: list[Any] | None = None,
) -> dict[str, Any]:
    block: dict[str, Any] = {
        "type": "cart_confirmation",
        "text": str(text or ""),
    }
    if item_name:
        block["itemName"] = str(item_name)
    if defaults_used:
        block["defaultsUsed"] = list(defaults_used)
    return block


def recommendations_block(
    *,
    title: str,
    items: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    normalized_items: list[dict[str, Any]] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        item_name = str(item.get("item_name") or item.get("itemName") or "").strip()
        if not item_name:
            continue
        normalized: dict[str, Any] = {"itemName": item_name}
        menu_item_id = item.get("menu_item_id") or item.get("menuItemId")
        if menu_item_id is not None:
            normalized["menuItemId"] = menu_item_id
        normalized_items.append(normalized)
    return {
        "type": "recommendations",
        "title": str(title or "Recommendations"),
        "items": normalized_items,
    }


def category_list_block(
    *,
    title: str,
    category: str,
    items: list[dict[str, Any]],
    overflow_count: int = 0,
) -> dict[str, Any]:
    normalized_items: list[dict[str, Any]] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        normalized_item: dict[str, Any] = {"name": name, "price": int(float(item.get("price") or 0))}
        normalized_items.append(normalized_item)
    block: dict[str, Any] = {
        "type": "category_list",
        "title": str(title or ""),
        "category": str(category or ""),
        "items": normalized_items,
    }
    if overflow_count > 0:
        block["overflowCount"] = int(overflow_count)
    return block


def options_prompt_block(
    *,
    question: str,
    options: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "type": "options_prompt",
        "question": str(question or ""),
        "options": list(options or []),
    }


def customization_review_block(
    *,
    summary: str,
    prompt: str,
    groups: list[dict[str, Any]],
    footer: str,
) -> dict[str, Any]:
    return {
        "type": "customization_review",
        "summary": str(summary or ""),
        "prompt": str(prompt or ""),
        "groups": list(groups or []),
        "footer": str(footer or ""),
    }
