"""
menu_signal.py — Live menu vocabulary for deterministic routing.

Provides category names, item name fragments, and variant option
names derived from the live menu. Used by static reply guards and
Layer 2 routing to make menu-aware decisions without hardcoding.

Refreshed every 10 minutes. Returns stale data on fetch failure
so the system degrades gracefully rather than failing hard.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_TTL = 600.0  # 10 minutes


@dataclass
class MenuSignal:
    # Lowercase category names: {"coffee", "tea", "pastries", ...}
    category_names: frozenset[str] = field(default_factory=frozenset)
    # Lowercase item name tokens (individual words from item names)
    # Used for passthrough guard — if user mentions any item word,
    # don't short-circuit with a static reply.
    item_name_tokens: frozenset[str] = field(default_factory=frozenset)
    # Full lowercase item names for exact/substring matching
    item_names: frozenset[str] = field(default_factory=frozenset)
    # Lowercase variant option names: {"small", "medium", "oat milk", ...}
    option_names: frozenset[str] = field(default_factory=frozenset)
    # Timestamp of last successful refresh
    refreshed_at: float = 0.0

    def is_fresh(self) -> bool:
        return (time.monotonic() - self.refreshed_at) < _TTL

    def is_empty(self) -> bool:
        return not self.category_names


_signal: MenuSignal = MenuSignal()

_GENERIC_TOKENS = frozenset({
    "a", "an", "the", "and", "or", "of", "with", "without",
    "hot", "iced", "cold", "warm", "fresh",
    "small", "medium", "large",
})


async def get_menu_signal() -> MenuSignal:
    """
    Returns a fresh MenuSignal, refreshing from live menu data
    if the cache is stale. Returns stale data on failure.
    Never raises.
    """
    global _signal

    if _signal.is_fresh() and not _signal.is_empty():
        return _signal

    try:
        from app.services.tools import fetch_menu_item_detail, fetch_menu_items

        menu_items = await fetch_menu_items()
        if not menu_items:
            return _signal

        category_names: set[str] = set()
        item_names: set[str] = set()
        item_name_tokens: set[str] = set()
        option_names: set[str] = set()

        for item in menu_items:
            if not isinstance(item, dict):
                continue

            cat = item.get("category")
            cat_name = (
                cat.get("name") if isinstance(cat, dict)
                else str(cat or "")
            ).strip().lower()
            if cat_name:
                category_names.add(cat_name)

            name = str(item.get("name") or "").strip().lower()
            if name:
                item_names.add(name)
                for token in name.split():
                    if token not in _GENERIC_TOKENS and len(token) > 2:
                        item_name_tokens.add(token)

        sample = [
            item for item in menu_items
            if isinstance(item, dict) and (item.get("id") or item.get("_id"))
        ][:10]
        for sample_item in sample:
            item_id = sample_item.get("id") or sample_item.get("_id")
            if not item_id:
                continue
            try:
                detail = await fetch_menu_item_detail(item_id)
                if not isinstance(detail, dict):
                    continue
                for group in (
                    detail.get("variantGroupDetails")
                    or detail.get("variants")
                    or []
                ):
                    if not isinstance(group, dict):
                        continue
                    if group.get("isActive") is False:
                        continue
                    for opt in (group.get("options") or []):
                        if not isinstance(opt, dict):
                            continue
                        if opt.get("isActive") is False:
                            continue
                        opt_name = str(opt.get("name") or "").strip().lower()
                        if opt_name:
                            option_names.add(opt_name)
                            for token in opt_name.split():
                                if token not in _GENERIC_TOKENS and len(token) > 2:
                                    item_name_tokens.add(token)
            except Exception:
                continue

        _signal = MenuSignal(
            category_names=frozenset(category_names),
            item_names=frozenset(item_names),
            item_name_tokens=frozenset(item_name_tokens),
            option_names=frozenset(option_names),
            refreshed_at=time.monotonic(),
        )
        logger.info({
            "stage": "menu_signal_refreshed",
            "categories": len(category_names),
            "items": len(item_names),
            "options": len(option_names),
        })
        return _signal

    except Exception as exc:
        logger.warning({
            "stage": "menu_signal_refresh_failed",
            "error": str(exc),
        })
        return _signal


def get_menu_signal_sync() -> MenuSignal:
    """
    Returns the current cached signal without refreshing.
    Safe to call from synchronous code. May be empty on cold start.
    """
    return _signal
