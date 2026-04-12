import random
from typing import Any

from app.services.tools import fetch_combo_suggestions

# Cooldown: tracks the last turn index when upsell was shown per session
_upsell_last_shown: dict[str, int] = {}
_session_turn_counter: dict[str, int] = {}

UPSELL_COOLDOWN_TURNS = 3  # don't upsell again for 3 turns after showing one

_NO_UPSELL_INTENTS = {"checkout", "clear_cart", "remove_item"}
MIN_COMBO_COUNT_FOR_UPSELL = 2

_PAIR_FUN_FACTS = {
    ("latte", "cheese croissant"): "The creamy body of a latte balances the flaky, salty richness of a cheese croissant.",
    ("cappuccino", "croissant"): "Foamy cappuccino and buttery pastry is a classic cafe pairing because texture contrast makes both stand out.",
    ("espresso", "dessert"): "Espresso is often paired with sweets because bitterness helps highlight dessert flavors.",
    ("latte", "chocolate croissant"): "Milk-forward lattes pair beautifully with chocolate pastry because the dairy smooths cocoa bitterness.",
    ("latte", "turkey & cheese"): "A mellow latte softens savory notes, making turkey and cheese feel richer without overpowering it.",
    ("cappuccino", "cheese croissant"): "Cappuccino foam adds lightness that complements the dense, buttery bite of a cheese croissant.",
    ("cappuccino", "chocolate croissant"): "Chocolate and cappuccino are a cafe staple: cocoa depth meets airy milk foam for balance.",
    ("americano", "cheese croissant"): "Americano's clean finish helps reset the palate between rich, cheesy pastry bites.",
    ("americano", "turkey & cheese"): "A crisp americano cuts through savory sandwich richness and keeps each bite tasting fresh.",
    ("double espresso", "chocolate croissant"): "A strong espresso shot intensifies chocolate aromas, creating a bolder dessert-like pairing.",
    ("espresso", "chocolate croissant"): "Espresso's roast notes naturally amplify cocoa flavor in chocolate pastries.",
    ("espresso macchiato", "cheese croissant"): "A touch of milk in macchiato rounds acidity while preserving espresso intensity against buttery pastry.",
    ("double espresso macchiato", "cheese croissant"): "The bolder espresso body stands up to rich pastry while milk keeps the sip smooth.",
    ("mocha", "chocolate croissant"): "Mocha with chocolate pastry layers cocoa-on-cocoa for a rich, indulgent combo.",
    ("white mocha", "cheese croissant"): "Sweet white mocha contrasts salty cheese pastry for a balanced sweet-savory experience.",
    ("matcha latte", "croissant"): "Matcha's earthy profile pairs with buttery pastry by adding gentle bitterness and aroma.",
    ("chai latte", "muffin"): "Warming chai spices pair naturally with baked goods and make muffin flavors feel deeper.",
    ("flat white", "cheese croissant"): "Flat white offers concentrated coffee flavor with silky milk, ideal for rich savory pastries.",
    ("cold brew", "cookie"): "Cold brew's smooth, low-acid profile works well with sweet cookies without feeling too heavy.",
    ("iced latte", "cookie"): "An iced latte cools sweetness and keeps cookie pairings light and refreshing.",
    ("frappe", "chocolate croissant"): "A chilled frappe and warm pastry create a hot-cold contrast that boosts texture and flavor.",
    ("espresso frap", "chocolate croissant"): "Frozen espresso drinks pair well with chocolate pastry because temperature contrast highlights sweetness.",
    ("tea", "dessert"): "Tea's aromatic notes can lift dessert flavors while keeping the finish clean.",
    ("green tea", "dessert"): "Green tea's gentle bitterness balances sugary desserts and keeps the palate refreshed.",
    ("black tea", "croissant"): "Black tea tannins pair nicely with buttery pastry by adding structure and balance.",
}

_GENERIC_PAIR_FUN_FACTS = [
    "A contrasting sip-and-bite combo helps each flavor stand out more clearly.",
    "Pairing different textures usually makes cafe combos feel more satisfying.",
    "Alternating a rich bite with a fresh sip keeps the palate balanced.",
    "A good drink-and-food match often boosts aroma and aftertaste together.",
    "Sweet and savory contrasts can make both items taste more vibrant.",
]


def _safe_lower(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        for key in ("name", "title", "label", "slug"):
            text = value.get(key)
            if isinstance(text, str) and text.strip():
                return text.strip().lower()
        return ""
    if isinstance(value, list):
        parts = [_safe_lower(part) for part in value]
        return " ".join(part for part in parts if part)
    return str(value).lower()


def _normalize_id(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _item_id(item: dict[str, Any] | None) -> str | None:
    if not isinstance(item, dict):
        return None
    for key in ("id", "_id", "menuItemId"):
        resolved = _normalize_id(item.get(key))
        if resolved is not None:
            return resolved
    return None


def _is_drink_item(item: dict[str, Any] | None) -> bool:
    if not item:
        return False
    category = _safe_lower(item.get("category"))
    subcategory = _safe_lower(item.get("subcategory"))
    hay = f"{category} {subcategory}"
    return any(
        word in hay
        for word in [
            "beverage",
            "beverages",
            "coffee",
            "latte",
            "tea",
            "drink",
            "drinks",
            "frap",
            "frappe",
        ]
    )


def _is_coffee_item(item: dict[str, Any] | None) -> bool:
    if not item:
        return False
    category = _safe_lower(item.get("category"))
    subcategory = _safe_lower(item.get("subcategory"))
    name = _safe_lower(item.get("name"))
    hay = f"{category} {subcategory} {name}"
    return any(word in hay for word in ["coffee", "latte", "espresso", "mocha", "cappuccino", "americano", "frap", "frappe", "flat white", "macchiato"])


def _is_food_item(item: dict[str, Any] | None) -> bool:
    if not item:
        return False
    category = _safe_lower(item.get("category"))
    subcategory = _safe_lower(item.get("subcategory"))
    hay = f"{category} {subcategory}"
    return any(
        word in hay
        for word in [
            "pastry",
            "pastries",
            "dessert",
            "desserts",
            "bakery",
            "cake",
            "cakes",
            "cookie",
            "cookies",
            "muffin",
            "muffins",
            "croissant",
            "croissants",
        ]
    )


def _is_complementary_pair(anchor_item: dict[str, Any] | None, suggested_item: dict[str, Any] | None) -> bool:
    anchor_is_drink = _is_drink_item(anchor_item)
    anchor_is_food = _is_food_item(anchor_item)
    suggested_is_drink = _is_drink_item(suggested_item)
    suggested_is_food = _is_food_item(suggested_item)

    # Be conservative: only treat as "perfect pairing" if both sides are classifiable.
    if not (anchor_is_drink or anchor_is_food):
        return False
    if not (suggested_is_drink or suggested_is_food):
        return False

    return (anchor_is_drink and suggested_is_food) or (anchor_is_food and suggested_is_drink)


def _build_combo_fun_fact(anchor_item: dict[str, Any] | None, suggested_item: dict[str, Any] | None) -> str | None:
    anchor_name = _safe_lower(anchor_item.get("name") if anchor_item else "")
    suggested_name = _safe_lower(suggested_item.get("name") if suggested_item else "")

    if anchor_name and suggested_name:
        direct = _PAIR_FUN_FACTS.get((anchor_name, suggested_name))
        if direct:
            return direct

    anchor_is_drink = _is_drink_item(anchor_item)
    anchor_is_food = _is_food_item(anchor_item)
    suggested_is_drink = _is_drink_item(suggested_item)
    suggested_is_food = _is_food_item(suggested_item)

    if anchor_is_drink and suggested_is_food:
        if _is_coffee_item(anchor_item):
            return random.choice(
                [
                    "Drink + pastry pairings work well because sweetness can soften coffee bitterness.",
                    "A pastry bite between sips can smooth roast intensity and highlight aroma.",
                    "Coffee and pastry pairings usually work best when one is rich and the other is clean-finishing.",
                ]
            )
        return random.choice(
            [
                "A snack alongside your drink makes for a more satisfying cafe experience.",
                "Pairing a drink with something to eat keeps energy balanced throughout your visit.",
                "A bite to go with your drink is always a good idea.",
            ]
        )
    if anchor_is_food and suggested_is_drink:
        return random.choice(
            [
                "A warm or iced drink helps cleanse the palate between rich pastry bites.",
                "Sips between bites refresh the palate and keep savory notes balanced.",
                "A good beverage pairing can lighten rich bakery flavors.",
            ]
        )
    return random.choice(_GENERIC_PAIR_FUN_FACTS)


def _category_key(item: dict[str, Any] | None) -> str:
    if not isinstance(item, dict):
        return "unknown"
    category = _safe_lower(item.get("category"))
    subcategory = _safe_lower(item.get("subcategory"))
    if category and subcategory:
        return f"{category}:{subcategory}"
    return category or subcategory or "unknown"


def _pick_diverse_random(
    items: list[dict[str, Any]],
    limit: int,
    *,
    used_categories: set[str] | None = None,
) -> list[dict[str, Any]]:
    if limit <= 0 or not items:
        return []

    used_categories = set(used_categories or set())
    shuffled = list(items)
    random.shuffle(shuffled)

    selected: list[dict[str, Any]] = []

    # Pass 1: prefer categories not used yet.
    for item in shuffled:
        if len(selected) >= limit:
            break
        key = _category_key(item)
        if key in used_categories:
            continue
        selected.append(item)
        used_categories.add(key)

    # Pass 2: fill any remaining slots regardless of category.
    if len(selected) < limit:
        selected_ids = {
            _item_id(item)
            for item in selected
            if _item_id(item) is not None
        }
        for item in shuffled:
            if len(selected) >= limit:
                break
            item_id = _item_id(item)
            if item_id is not None and item_id in selected_ids:
                continue
            selected.append(item)
            if item_id is not None:
                selected_ids.add(item_id)

    return selected


def should_upsell(session_id: str, intent: str, cart_items: list[dict]) -> bool:
    if intent in _NO_UPSELL_INTENTS:
        return False
    if not cart_items:
        return False

    # Turn is incremented once per incoming chat message via record_turn().
    turn = _session_turn_counter.get(session_id, 0)

    last_shown = _upsell_last_shown.get(session_id, -999)
    if turn - last_shown < UPSELL_COOLDOWN_TURNS:
        return False

    return True


def record_turn(session_id: str) -> int:
    """Increment and return the conversation turn for this session."""
    turn = _session_turn_counter.get(session_id, 0) + 1
    _session_turn_counter[session_id] = turn
    return turn


async def suggest_upsell_items(
    cart_items: list[dict],
    menu_items: list[dict],
    limit: int = 1,
    anchor_menu_item: dict | None = None,
) -> list[dict]:
    menu_by_id = {
        _item_id(item): item
        for item in menu_items
        if _item_id(item) is not None
    }
    cart_names = {_safe_lower(i.get("name")) for i in cart_items}
    cart_menu_item_ids = {
        _item_id(i)
        for i in cart_items
        if _item_id(i) is not None
    }
    cart_categories = {_safe_lower(i.get("category")) for i in cart_items}
    # Use the explicitly provided anchor (just-added item) rather than the last cart item.
    recent_item = anchor_menu_item if anchor_menu_item is not None else (cart_items[-1] if cart_items else None)
    recent_menu_item_id = _item_id(recent_item)
    recent_is_drink = _is_drink_item(recent_item)
    recent_is_food = _is_food_item(recent_item)

    # Try to fetch combos for the most recent item first (primary anchor)
    # to ensure upsell suggestions are anchored to the item just added.
    primary_combo_stats = []
    if recent_menu_item_id is not None:
        primary_combo_stats = await fetch_combo_suggestions(
            anchor_menu_item_ids=[recent_menu_item_id],
            exclude_menu_item_ids=sorted(cart_menu_item_ids),
            limit=max(limit * 10, 20),
        )

    # If insufficient results from primary anchor, fall back to full cart
    combo_stats = (
        primary_combo_stats
        if primary_combo_stats and len(primary_combo_stats) >= limit
        else await fetch_combo_suggestions(
            anchor_menu_item_ids=sorted(cart_menu_item_ids),
            exclude_menu_item_ids=sorted(cart_menu_item_ids),
            limit=max(limit * 10, 20),
        )
    )
    combo_ranked_by_id: dict[int, dict[str, Any]] = {}
    combo_fun_facts_by_id: dict[int, str] = {}
    for combo in combo_stats:
        suggested_menu_item_id = combo.get("suggestedMenuItemId")
        if suggested_menu_item_id is None:
            continue
        combo_count = int(combo.get("count") or 0)
        if combo_count < 1:
            continue

        suggested_id = _normalize_id(suggested_menu_item_id)
        if suggested_id is None:
            continue
        item = menu_by_id.get(suggested_id)
        if not item:
            continue
        if not item.get("isAvailable", True):
            continue
        if _safe_lower(item.get("name")) in cart_names:
            continue

        anchor_menu_item_id = combo.get("anchorMenuItemId")
        anchor_item = menu_by_id.get(_normalize_id(anchor_menu_item_id)) if anchor_menu_item_id is not None else None
        is_complementary = _is_complementary_pair(anchor_item, item)
        fun_fact = _build_combo_fun_fact(anchor_item, item)
        existing = combo_ranked_by_id.get(suggested_id)

        # Keep the strongest signal per suggested item id.
        if (
            existing is None
            or combo_count > int(existing.get("count") or 0)
            or (is_complementary and not bool(existing.get("is_complementary")))
        ):
            combo_ranked_by_id[suggested_id] = {
                "count": combo_count,
                "item": item,
                "is_complementary": is_complementary,
                "fun_fact": fun_fact,
                "anchor_menu_item_id": _normalize_id(anchor_menu_item_id) if anchor_menu_item_id is not None else None,
            }
            if fun_fact:
                combo_fun_facts_by_id[suggested_id] = fun_fact

    has_drink = any(
        w in cat for cat in cart_categories
        for w in ["beverage", "coffee", "latte", "tea", "drink", "frap"]
    )
    has_food = any(
        w in cat for cat in cart_categories
        for w in ["pastry", "dessert", "bakery", "cake", "cookie", "muffin", "croissant"]
    )

    candidates: list[dict[str, Any]] = []
    for item in menu_items:
        if not item.get("isAvailable", True):
            continue
        name = _safe_lower(item.get("name", ""))
        if name in cart_names:
            continue
        cat = _safe_lower(item.get("category", ""))
        sub = _safe_lower(item.get("subcategory", ""))

        item_is_drink = any(w in cat or w in sub for w in ["beverage", "coffee", "latte", "tea", "drink", "frap"])
        item_is_food = any(w in cat or w in sub for w in ["pastry", "dessert", "bakery", "cake", "cookie", "muffin", "croissant"])

        # Prefer complement of the most recently added item.
        if recent_is_food:
            if item_is_drink:
                candidates.append(item)
            continue
        if recent_is_drink:
            if item_is_food:
                candidates.append(item)
            continue

        # Fallback when recent item category is unclear.
        if has_drink and item_is_food:
            candidates.append(item)
        elif has_food and item_is_drink:
            candidates.append(item)

    combo_records = list(combo_ranked_by_id.values())

    # Priority policy:
    # 1) high-frequency complementary combos
    # 2) high-frequency combos (any category)
    # 3) any observed combo
    scoped_combo_records = (
        [
            record
            for record in combo_records
            if recent_menu_item_id is not None and record.get("anchor_menu_item_id") == recent_menu_item_id
        ]
        or combo_records
    )

    priority_combo_records = [
        record
        for record in scoped_combo_records
        if int(record.get("count") or 0) >= MIN_COMBO_COUNT_FOR_UPSELL and bool(record.get("is_complementary"))
    ]
    if not priority_combo_records:
        priority_combo_records = [
            record
            for record in scoped_combo_records
            if int(record.get("count") or 0) >= MIN_COMBO_COUNT_FOR_UPSELL
        ]
    if not priority_combo_records:
        priority_combo_records = scoped_combo_records

    if recent_is_food:
        preferred = [record for record in priority_combo_records if _is_drink_item(record.get("item"))]
        if preferred:
            priority_combo_records = preferred
    elif recent_is_drink:
        preferred = [record for record in priority_combo_records if _is_food_item(record.get("item"))]
        if preferred:
            priority_combo_records = preferred

    priority_combo_records.sort(
        key=lambda record: (
            -int(record.get("count") or 0),
            not bool(record.get("is_complementary")),
        )
    )
    combo_items_ordered = [record["item"] for record in priority_combo_records if isinstance(record.get("item"), dict)]

    # Merge candidates while preserving combo priority and avoiding duplicates.
    merged_candidates: list[dict] = []
    seen_names: set[str] = set()

    for item in combo_items_ordered + candidates:
        name = _safe_lower(item.get("name"))
        if not name or name in seen_names:
            continue
        seen_names.add(name)
        merged_candidates.append(item)

    if not merged_candidates:
        # Ultimate fallback: suggest any available item not already in cart.
        merged_candidates = [
            item
            for item in menu_items
            if isinstance(item, dict)
            and item.get("isAvailable", True)
            and _safe_lower(item.get("name")) not in cart_names
        ]
        if not merged_candidates:
            return []

    # Stage 1: always take the highest-frequency combos first.
    selected: list[dict[str, Any]] = combo_items_ordered[:limit]

    # Stage 2: if we still need slots, fill with diverse random candidates.
    if len(selected) < limit:
        selected_ids = {
            _item_id(item)
            for item in selected
            if _item_id(item) is not None
        }
        random_pool = [
            item for item in merged_candidates
            if _item_id(item) is not None and _item_id(item) not in selected_ids
        ]
        used_categories = {_category_key(item) for item in selected}
        selected.extend(
            _pick_diverse_random(random_pool, limit - len(selected), used_categories=used_categories)
        )

    combo_candidate_ids = {
        _item_id(item)
        for item in combo_items_ordered
        if _item_id(item) is not None
    }

    return [
        {
            "type": "upsell",
            "item_name": item["name"],
            "menu_item_id": item.get("id") or item.get("_id") or item.get("menuItemId"),
            "upsell_source": "combo" if _item_id(item) in combo_candidate_ids else "fallback",
            "fun_fact": (
                combo_fun_facts_by_id.get(_item_id(item))
                if _item_id(item) in combo_candidate_ids and _item_id(item) is not None
                else _build_combo_fun_fact(
                    anchor_menu_item if anchor_menu_item is not None else (cart_items[-1] if cart_items else None),
                    item,
                )
            ),
        }
        for item in selected
    ]


async def get_upsell_suggestions(
    session_id: str,
    intent: str,
    cart_items: list[dict],
    menu_items: list[dict],
    anchor_menu_item: dict | None = None,
) -> list[dict]:
    if not should_upsell(session_id, intent, cart_items):
        return []
    suggestions = await suggest_upsell_items(cart_items, menu_items, anchor_menu_item=anchor_menu_item)
    if suggestions:
        _upsell_last_shown[session_id] = _session_turn_counter.get(session_id, 0)
    return suggestions
