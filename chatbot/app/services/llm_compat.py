from app.schemas.actions import ParsedItemRequest, ParsedOperation, ParsedRequest


def parsed_request_to_legacy_dict(parsed: ParsedRequest) -> dict:
    operations = []
    for op in parsed.operations:
        items = []
        follow_up_ref = None
        for index, item in enumerate(op.items):
            item_follow_up_ref = (item.follow_up_ref or "").strip() or None
            if index == 0 and item_follow_up_ref:
                follow_up_ref = item_follow_up_ref
            items.append(
                {
                    "item_name": (item.item_query or "").strip() or None,
                    "quantity": item.quantity,
                    # Compatibility is intentionally asymmetric: modifiers are
                    # flattened into addons because the legacy compiler already
                    # re-resolves them against the menu catalog.
                    "size": None,
                    "options": {"milk": None},
                    "addons": [str(value).strip() for value in item.modifiers if str(value).strip()],
                    "instructions": "; ".join(
                        str(value).strip() for value in item.notes if str(value).strip()
                    ),
                }
            )
        operations.append(
            {
                "intent": op.intent,
                "items": items,
                "follow_up_ref": follow_up_ref,
                "needs_clarification": op.needs_clarification,
                "reason": op.reason,
            }
        )

    return {
        "operations": operations,
        "confidence": parsed.confidence,
        "needs_clarification": parsed.needs_clarification,
        "reason": parsed.reason,
        "fallback_needed": parsed.confidence < 0.6,
        "intent": operations[0]["intent"],
        "items": operations[0]["items"],
        "follow_up_ref": operations[0]["follow_up_ref"],
    }


def legacy_dict_to_parsed_request(raw: dict) -> ParsedRequest | None:
    try:
        operations_raw = raw.get("operations")
        if not isinstance(operations_raw, list) or not operations_raw:
            return None

        operations = []
        for op_raw in operations_raw:
            if not isinstance(op_raw, dict):
                return None
            follow_up_ref = str(op_raw.get("follow_up_ref") or "").strip() or None
            items = []
            raw_items = op_raw.get("items") or []
            if not isinstance(raw_items, list):
                return None
            for index, item in enumerate(raw_items):
                if not isinstance(item, dict):
                    return None
                modifiers = []
                size = str(item.get("size") or "").strip()
                if size:
                    modifiers.append(size)
                milk = ""
                if isinstance(item.get("options"), dict):
                    milk = str(item["options"].get("milk") or "").strip()
                if milk:
                    modifiers.append(milk if "milk" in milk.lower() else f"{milk} milk")
                addons = item.get("addons")
                if isinstance(addons, list):
                    modifiers.extend(str(value).strip() for value in addons if str(value).strip())
                elif isinstance(addons, str) and addons.strip():
                    modifiers.append(addons.strip())
                instructions = str(item.get("instructions") or "").strip()
                items.append(
                    ParsedItemRequest(
                        item_query=str(item.get("item_name") or "").strip(),
                        quantity=int(item.get("quantity")) if item.get("quantity") is not None else 1,
                        modifiers=modifiers,
                        notes=[part.strip() for part in instructions.split(";") if part.strip()],
                        follow_up_ref=follow_up_ref if index == 0 else None,
                    )
                )
            operations.append(
                ParsedOperation(
                    intent=op_raw.get("intent"),
                    items=items,
                    needs_clarification=bool(op_raw.get("needs_clarification", False)),
                    reason=str(op_raw.get("reason") or ""),
                )
            )

        return ParsedRequest(
            operations=operations,
            confidence=float(raw.get("confidence") or 0.0),
            needs_clarification=bool(raw.get("needs_clarification", False)),
            reason=str(raw.get("reason") or ""),
        )
    except Exception:
        return None
