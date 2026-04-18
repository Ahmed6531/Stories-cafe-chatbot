"""
One-shot patcher: applies all Phase 4 changes to orchestrator.py.
Run from the chatbot/ directory.
"""
import sys

with open("app/services/orchestrator.py", "r", encoding="utf-8") as f:
    lines = f.readlines()
content = "".join(lines)

print(f"Original: {len(lines)} lines")

# ─── Step 1: Delete _execute_single_op + _drain_pending_operations ────────────
# Lines 2038-2792 (1-indexed) => indices 2037-2791 (0-indexed)
assert lines[2037].startswith("async def _execute_single_op("), repr(lines[2037])
assert lines[2793].startswith("async def process_chat_message("), repr(lines[2793])
lines = lines[:2037] + lines[2792:]
content = "".join(lines)
print(f"Step 1: {len(lines)} lines")

# ─── Step 2: Replace _drain_pending_operations call in _finalize_guided_order ─
OLD2 = (
    "    # Check if there are pending operations to drain\n"
    "    pending_ops = get_pending_operations(session_id)\n"
    "    if pending_ops:\n"
    "        accumulated = [reply_text]\n"
    "        drain_response = await _drain_pending_operations(\n"
    "            session_id=session_id,\n"
    '            cart_id=cart_result["cart_id"],\n'
    "            session=get_session(session_id),\n"
    "            auth_cookie=None,\n"
    "            normalized_message=normalized_message,\n"
    "            accumulated_replies=accumulated,\n"
    "        )\n"
    "        if drain_response:\n"
    "            return drain_response\n"
)
NEW2 = (
    "    # Check if there are pending operations to drain via executor.\n"
    "    pending_ops_raw = get_pending_operations(session_id)\n"
    "    if pending_ops_raw:\n"
    "        from app.services.executor import execute_compiled_operations\n"
    "        from app.schemas.actions import CompiledOperation\n"
    "        try:\n"
    "            pending_ops_compiled = [CompiledOperation.model_validate(op) for op in pending_ops_raw]\n"
    "        except Exception:\n"
    "            pending_ops_compiled = []\n"
    "        clear_pending_operations(session_id)\n"
    "        if pending_ops_compiled:\n"
    "            drain_result = await execute_compiled_operations(\n"
    "                operations=pending_ops_compiled,\n"
    "                clarifications=[],\n"
    "                failures=[],\n"
    "                session_id=session_id,\n"
    '                cart_id=cart_result["cart_id"],\n'
    "                session=get_session(session_id),\n"
    "                auth_cookie=None,\n"
    "            )\n"
    '            if drain_result.reply and drain_result.reply != "Done.":\n'
    '                reply_text = reply_text + " " + drain_result.reply\n'
    "            cart_result = {\n"
    '                "cart_id": drain_result.cart_id or cart_result["cart_id"],\n'
    '                "cart": cart_result.get("cart", []),\n'
    "            }\n"
    "            if drain_result.needs_followup:\n"
    "                return ChatMessageResponse(\n"
    "                    session_id=session_id,\n"
    '                    status="ok",\n'
    "                    reply=reply_text,\n"
    "                    intent=intent,\n"
    "                    cart_updated=True,\n"
    "                    cart_id=drain_result.cart_id,\n"
    "                    defaults_used=[],\n"
    "                    suggestions=[],\n"
    "                    metadata={\n"
    '                        "normalized_message": normalized_message,\n'
    '                        "pipeline_stage": "guided_ordering_start",\n'
    "                    },\n"
    "                )\n"
)
assert OLD2 in content, "OLD2 not found"
content = content.replace(OLD2, NEW2, 1)
lines = content.splitlines(keepends=True)
print(f"Step 2: {len(lines)} lines")

# ─── Step 3: Delete multi_op branch ──────────────────────────────────────────
start3 = content.find('        if intent == "multi_op":\n')
end3 = content.find("        # ── pending_ops_confirmation stage ───────────────────────────────────\n")
assert start3 != -1 and end3 != -1 and start3 < end3, f"{start3=} {end3=}"
content = content[:start3] + content[end3:]
lines = content.splitlines(keepends=True)
print(f"Step 3: {len(lines)} lines")

# ─── Step 4: Replace _drain_pending_operations in pending_ops_confirmation ────
OLD4 = (
    "                drain_response = await _drain_pending_operations(\n"
    "                    session_id=session_id,\n"
    "                    cart_id=cart_id,\n"
    "                    session=session,\n"
    "                    auth_cookie=auth_cookie,\n"
    "                    normalized_message=normalized_message,\n"
    "                    accumulated_replies=accumulated,\n"
    "                )\n"
    "                if drain_response:\n"
    "                    return drain_response"
)
NEW4 = (
    "                from app.services.executor import execute_compiled_operations\n"
    "                from app.schemas.actions import CompiledOperation\n"
    "                from app.services.session_store import clear_pending_operations as _clr_pend\n"
    "                try:\n"
    "                    compiled_pending = [CompiledOperation.model_validate(op) for op in pending_ops]\n"
    "                except Exception:\n"
    "                    compiled_pending = []\n"
    "                _clr_pend(session_id)\n"
    "                if compiled_pending:\n"
    "                    drain_result = await execute_compiled_operations(\n"
    "                        operations=compiled_pending,\n"
    "                        clarifications=[],\n"
    "                        failures=[],\n"
    "                        session_id=session_id,\n"
    "                        cart_id=cart_id,\n"
    "                        session=session,\n"
    "                        auth_cookie=auth_cookie,\n"
    "                    )\n"
    '                    if drain_result.reply and drain_result.reply != "Done.":\n'
    "                        accumulated.append(drain_result.reply)\n"
    "                    cart_id = drain_result.cart_id or cart_id\n"
    "                    if drain_result.needs_followup:\n"
    "                        return ChatMessageResponse(\n"
    "                            session_id=session_id,\n"
    '                            status="ok",\n'
    '                            reply=" ".join(accumulated),\n'
    '                            intent="unknown",\n'
    "                            cart_updated=True,\n"
    "                            cart_id=cart_id,\n"
    "                            defaults_used=[],\n"
    "                            suggestions=[],\n"
    "                            metadata={\n"
    '                                "normalized_message": normalized_message,\n'
    '                                "pipeline_stage": "pending_ops_drain_guided",\n'
    "                            },\n"
    "                        )"
)
assert OLD4 in content, "OLD4 not found"
content = content.replace(OLD4, NEW4, 1)
lines = content.splitlines(keepends=True)
print(f"Step 4: {len(lines)} lines")

# ─── Step 5: Inject helpers before process_chat_message ───────────────────────
HELPERS = '''

def _legacy_item_to_modifiers(item: dict) -> list[str]:
    mods: list[str] = []
    size = str(item.get("size") or "").strip()
    if size:
        mods.append(size)
    options = item.get("options") if isinstance(item.get("options"), dict) else {}
    milk = str(options.get("milk") or "").strip()
    if milk:
        mods.append(milk if "milk" in milk.lower() else f"{milk} milk")
    for addon in (item.get("addons") or []):
        cleaned = str(addon).strip()
        if cleaned:
            mods.append(cleaned)
    return mods


def _resolved_to_parsed_request(resolved: dict, intent: str, session: dict):
    """Convert a resolve_intent result dict to a ParsedRequest for the compiler."""
    from app.schemas.actions import ParsedRequest, ParsedOperation, ParsedItemRequest

    if intent == "multi_op":
        raw_ops = resolved.get("operations") or []
        ops = []
        for raw_op in raw_ops:
            op_intent = str(raw_op.get("intent") or "unknown")
            items = [
                ParsedItemRequest(
                    item_query=str(item.get("item_name") or "").strip(),
                    quantity=int(item.get("quantity") or 1),
                    modifiers=_legacy_item_to_modifiers(item),
                    notes=[str(item.get("instructions") or "").strip()] if item.get("instructions") else [],
                    follow_up_ref=item.get("follow_up_ref"),
                )
                for item in (raw_op.get("items") or [])
                if isinstance(item, dict)
            ]
            ops.append(ParsedOperation(intent=op_intent, items=items))
        if not ops:
            return None
        return ParsedRequest(operations=ops, confidence=float(resolved.get("confidence") or 1.0))

    elif intent == "repeat_order":
        session_items = (session or {}).get("last_items") or []
        if not session_items:
            return None  # caller handles API-based repeat
        items = [
            ParsedItemRequest(
                item_query=str(item.get("item_name") or "").strip(),
                quantity=int(item.get("quantity") or 1),
            )
            for item in session_items
            if isinstance(item, dict) and item.get("item_name")
        ]
        if not items:
            return None
        return ParsedRequest(
            operations=[ParsedOperation(intent="add_items", items=items)],
            confidence=1.0,
        )

    else:  # add_items / add_item
        items = [
            ParsedItemRequest(
                item_query=str(item.get("item_name") or "").strip(),
                quantity=int(item.get("quantity") or 1),
                modifiers=_legacy_item_to_modifiers(item),
                notes=[str(item.get("instructions") or "").strip()] if item.get("instructions") else [],
                follow_up_ref=item.get("follow_up_ref"),
            )
            for item in (resolved.get("items") or [])
            if isinstance(item, dict)
        ]
        if not items:
            return None
        return ParsedRequest(
            operations=[ParsedOperation(intent="add_items", items=items)],
            confidence=float(resolved.get("confidence") or 1.0),
        )


'''

marker5 = "async def process_chat_message("
idx5 = content.find(marker5)
assert idx5 != -1
content = content[:idx5] + HELPERS + content[idx5:]
lines = content.splitlines(keepends=True)
print(f"Step 5: {len(lines)} lines")

# ─── Step 6: Replace add_items + repeat_order branches with unified handler ───
UNIFIED = (
    '        if intent in {"add_items", "add_item", "multi_op", "repeat_order"}:\n'
    "            from app.services.executor import execute_compiled_operations\n"
    "            from app.services.compiler import compile_operation, CompileSuccess, CompileNeedsClarification, CompileFailure\n"
    "\n"
    "            # For repeat_order with no session items, keep direct menuItemId path.\n"
    '            if intent == "repeat_order":\n'
    "                session_items_ro: list = (session or {}).get(\"last_items\") or []\n"
    "                if not session_items_ro:\n"
    "                    recent_orders = await fetch_my_orders(auth_cookie=auth_cookie, limit=20)\n"
    "                    recent_order_lines: list[dict] = []\n"
    "                    for order in (recent_orders or []):\n"
    "                        if not isinstance(order, dict):\n"
    "                            continue\n"
    "                        if str(order.get(\"status\") or \"\").strip().lower() == \"cancelled\":\n"
    "                            continue\n"
    "                        order_items = order.get(\"items\")\n"
    "                        if not isinstance(order_items, list) or not order_items:\n"
    "                            continue\n"
    "                        normalized_lines = []\n"
    "                        for line in order_items:\n"
    "                            if not isinstance(line, dict):\n"
    "                                continue\n"
    "                            mid = line.get(\"menuItemId\")\n"
    "                            qty = int(line.get(\"qty\") or 1)\n"
    "                            if mid is None or qty < 1:\n"
    "                                continue\n"
    "                            normalized_lines.append({\n"
    "                                \"menuItemId\": mid, \"qty\": qty,\n"
    "                                \"selectedOptions\": line.get(\"selectedOptions\") if isinstance(line.get(\"selectedOptions\"), list) else [],\n"
    "                                \"instructions\": str(line.get(\"instructions\") or \"\"),\n"
    "                                \"name\": str(line.get(\"name\") or \"\").strip(),\n"
    "                            })\n"
    "                        if normalized_lines:\n"
    "                            recent_order_lines = normalized_lines\n"
    "                            break\n"
    "\n"
    "                    if not recent_order_lines:\n"
    "                        _ro_fallback = await generate_fallback_reply(normalized_message, reason=\"repeat_order_no_history\")\n"
    "                        return ChatMessageResponse(\n"
    "                            session_id=session_id, status=\"ok\",\n"
    "                            reply=_ro_fallback or \"I don't have a record of a previous order. What would you like to add?\",\n"
    "                            intent=intent, cart_updated=False, cart_id=cart_id,\n"
    "                            defaults_used=[], suggestions=[],\n"
    "                            metadata={\"normalized_message\": normalized_message, \"pipeline_stage\": \"repeat_order_no_history\"},\n"
    "                        )\n"
    "\n"
    "                    _ro_success, _ro_failed, _ro_cart_id, _ro_cart_data = [], [], cart_id, None\n"
    "                    for _ro_line in recent_order_lines:\n"
    "                        _ro_mid = _ro_line.get(\"menuItemId\")\n"
    "                        _ro_qty = int(_ro_line.get(\"qty\") or 1)\n"
    "                        if _ro_mid is None or _ro_qty < 1:\n"
    "                            continue\n"
    "                        try:\n"
    "                            _ro_cart_data = await add_item_to_cart(\n"
    "                                menu_item_id=_ro_mid, qty=_ro_qty,\n"
    "                                selected_options=_ro_line.get(\"selectedOptions\") if isinstance(_ro_line.get(\"selectedOptions\"), list) else [],\n"
    "                                instructions=str(_ro_line.get(\"instructions\") or \"\"),\n"
    "                                cart_id=_ro_cart_id,\n"
    "                            )\n"
    "                            _ro_cart_id = _ro_cart_data[\"cart_id\"]\n"
    "                            _ro_success.append({\"matched_name\": _ro_line.get(\"name\") or \"item\", \"quantity\": _ro_qty})\n"
    "                        except ExpressAPIError:\n"
    "                            _ro_failed.append(_build_failed_item(_ro_line.get(\"name\") or \"item\", \"could not add right now\"))\n"
    "\n"
    "                    if not _ro_success:\n"
    "                        return ChatMessageResponse(\n"
    "                            session_id=session_id, status=\"ok\",\n"
    "                            reply=\"I couldn't re-add your last checked-out order.\",\n"
    "                            intent=\"repeat_order\", cart_updated=False, cart_id=_ro_cart_id,\n"
    "                            defaults_used=[], suggestions=[],\n"
    "                            metadata={\"normalized_message\": normalized_message, \"pipeline_stage\": \"repeat_order_failed\"},\n"
    "                        )\n"
    "\n"
    "                    _ro_added_lines = [f\"- {i['quantity']}x {i['matched_name']}\" for i in _ro_success]\n"
    "                    _ro_reply = \"Re-added your last checked-out order:\\n\" + \"\\n\".join(_ro_added_lines)\n"
    "                    if _ro_cart_data:\n"
    "                        _ro_summary = build_cart_summary(_ro_cart_data.get(\"cart\", []))\n"
    "                        if _ro_summary:\n"
    "                            _ro_reply += f\"\\n\\nYour cart now contains:\\n{_ro_summary}\"\n"
    "                    return ChatMessageResponse(\n"
    "                        session_id=session_id, status=\"ok\", reply=_ro_reply,\n"
    "                        intent=\"repeat_order\", cart_updated=True, cart_id=_ro_cart_id,\n"
    "                        defaults_used=[], suggestions=[],\n"
    "                        metadata={\"normalized_message\": normalized_message, \"pipeline_stage\": \"repeat_order_done\"},\n"
    "                    )\n"
    "\n"
    "            # ── Compile + execute path ────────────────────────────────────\n"
    "            parsed_request = _resolved_to_parsed_request(resolved, intent, session)\n"
    "            if parsed_request is None or not parsed_request.operations:\n"
    "                return ChatMessageResponse(\n"
    "                    session_id=session_id, status=\"ok\",\n"
    "                    reply=\"I'm not sure what you'd like to add.\",\n"
    "                    intent=\"add_items\", cart_updated=False, cart_id=cart_id,\n"
    "                    defaults_used=[], suggestions=[],\n"
    "                    metadata={\"normalized_message\": normalized_message, \"pipeline_stage\": \"add_items_missing\"},\n"
    "                )\n"
    "\n"
    "            _menu_for_compile = await fetch_menu_items()\n"
    "            _cart_for_compile = await get_cart(cart_id=cart_id)\n"
    "            _compile_results = []\n"
    "            for _cop in parsed_request.operations:\n"
    "                _compile_results.extend(\n"
    "                    await compile_operation(_cop, session, _cart_for_compile[\"cart\"], _menu_for_compile)\n"
    "                )\n"
    "\n"
    "            _ops_ok = [r.operation for r in _compile_results if isinstance(r, CompileSuccess)]\n"
    "            _clarifs = [r for r in _compile_results if isinstance(r, CompileNeedsClarification)]\n"
    "            _fails = [r for r in _compile_results if isinstance(r, CompileFailure)]\n"
    "\n"
    "            exec_result = await execute_compiled_operations(\n"
    "                operations=_ops_ok,\n"
    "                clarifications=_clarifs,\n"
    "                failures=_fails,\n"
    "                session_id=session_id,\n"
    "                cart_id=cart_id,\n"
    "                session=session,\n"
    "                auth_cookie=auth_cookie,\n"
    "            )\n"
    "\n"
    "            if session is not None:\n"
    "                session[\"cart_id\"] = exec_result.cart_id\n"
    '                session["pending_clarification"] = None\n'
    "                if not exec_result.needs_followup:\n"
    "                    set_session_stage(session_id, None)\n"
    "\n"
    "            update_last_action(\n"
    "                session_id, normalized_message, exec_result.reply,\n"
    "                exec_result.intent_for_response or intent,\n"
    "            )\n"
    "\n"
    "            return ChatMessageResponse(\n"
    "                session_id=session_id,\n"
    '                status="ok",\n'
    "                reply=exec_result.reply,\n"
    "                intent=exec_result.intent_for_response or intent,\n"
    "                cart_updated=exec_result.cart_updated,\n"
    "                cart_id=exec_result.cart_id,\n"
    "                defaults_used=exec_result.defaults_used,\n"
    "                suggestions=exec_result.suggestions,\n"
    "                metadata={\n"
    '                    "normalized_message": normalized_message,\n'
    "                    **exec_result.metadata,\n"
    "                },\n"
    "            )\n"
    "\n"
)

# Remove the old add_items branch and repeat_order branch
START6 = '        if intent in {"add_item", "add_items"}:\n'
END6 = "        # Safety net — should not be reached after the pipeline routes properly.\n"
idx6s = content.find(START6)
idx6e = content.find(END6)
assert idx6s != -1 and idx6e != -1 and idx6s < idx6e, f"{idx6s=} {idx6e=}"
content = content[:idx6s] + UNIFIED + content[idx6e:]
lines = content.splitlines(keepends=True)
print(f"Step 6: {len(lines)} lines")

# ─── Sanity checks ────────────────────────────────────────────────────────────
assert "_drain_pending_operations" not in content, "Still refs _drain_pending_operations"
assert "_execute_single_op" not in content, "Still refs _execute_single_op"
assert "compile_operation" in content, "compile_operation missing"
assert "execute_compiled_operations" in content, "execute_compiled_operations missing"
assert "_resolved_to_parsed_request" in content, "_resolved_to_parsed_request missing"

# Write
with open("app/services/orchestrator.py", "w", encoding="utf-8") as f:
    f.write(content)

print(f"\nFinal: {len(lines)} lines (was {sum(1 for _ in open('app/services/orchestrator.py', encoding='utf-8'))})")
print("Done.")
