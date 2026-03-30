import crypto from "crypto";
import { Cart } from "../models/Cart.js";
import { MenuItem } from "../models/MenuItem.js";
import { VariantGroup } from "../models/VariantGroup.js";
import {
  calculateSelectedOptionsDelta,
  createVariantGroupMap,
  resolveVariantGroupsForMenuItem,
  sanitizeSelectedOptions,
  sameSelectedOptions,
  sortSelectedOptionsForDisplay,
} from "../utils/variantPricing.js";

function makeCartId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

function getCartIdFromRequest(req) {
  return req.get("x-cart-id") || req.query.cartId || null;
}

function emptyCartResponse() {
  return { cartId: null, count: 0, items: [] };
}

function normalizeLegacyCartItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((line) => {
      const normalizedMenuItemId = Number(line?.menuItemId);
      if (!Number.isFinite(normalizedMenuItemId)) {
        return null;
      }

      const normalizedQty = Number(line?.qty);
      const qty = Number.isFinite(normalizedQty) && normalizedQty > 0
        ? Math.floor(normalizedQty)
        : 1;

      const rawSelectedOptions = Array.isArray(line?.selectedOptions)
        ? line.selectedOptions
        : line?.selectedOptions != null
          ? [line.selectedOptions]
          : [];

      const selectedOptions = sanitizeSelectedOptions(rawSelectedOptions);
      const instructions = typeof line?.instructions === "string" ? line.instructions.trim() : "";

      return {
        menuItemId: normalizedMenuItemId,
        qty,
        selectedOptions,
        instructions,
      };
    })
    .filter(Boolean);
}

async function findCartByIdSafely(cartId, { createIfMissing = false } = {}) {
  if (!cartId) return null;

  try {
    const cart = await Cart.findOne({ cartId });
    if (cart) return cart;
  } catch (err) {
    if (err.name !== "CastError" && err.name !== "ValidationError") throw err;
    console.warn("Cart hydration failed, trying legacy recovery:", err?.message || err);
  }

  const rawCart = await Cart.collection.findOne({ cartId });

  if (!rawCart) {
    if (!createIfMissing) return null;
    return Cart.create({ cartId, items: [] });
  }

  const normalizedItems = normalizeLegacyCartItems(rawCart.items);
  await Cart.collection.updateOne(
    { _id: rawCart._id },
    { $set: { items: normalizedItems } },
  );

  try {
    return await Cart.findOne({ cartId });
  } catch (err) {
    console.error("Cart recovery failed after normalization, rebuilding cart:", err?.message || err);
    await Cart.collection.deleteOne({ _id: rawCart._id });
    if (!createIfMissing) return null;
    return Cart.create({ cartId, items: [] });
  }
}

async function getExistingCart(req) {
  const cartId = getCartIdFromRequest(req);
  if (!cartId) return { cart: null, cartId: null };

  const cart = await findCartByIdSafely(cartId);
  return { cart, cartId: cart ? cartId : null };
}

async function getOrCreateWritableCart(req) {
  let cartId = getCartIdFromRequest(req);

  if (!cartId) {
    cartId = makeCartId();
    const cart = await Cart.create({ cartId, items: [] });
    return { cart, cartId };
  }

  const cart = await findCartByIdSafely(cartId, { createIfMissing: true });
  return { cart, cartId };
}

async function buildCartResponse(cart) {
  const ids = cart.items
    .map((x) => Number(x.menuItemId))
    .filter((id) => Number.isFinite(id));

  const menuItems = await MenuItem.find({
    id: { $in: ids }
  });

  const byNumericId = new Map(menuItems.map((m) => [Number(m.id), m]));

  // Fetch all variant groups referenced by these menu items
  const allVariantGroupIds = new Set();
  menuItems.forEach(item => {
    if (item.variantGroups) {
      item.variantGroups.forEach(vg => allVariantGroupIds.add(vg));
    }
  });

  const variantGroups = await VariantGroup.find({
    groupId: { $in: Array.from(allVariantGroupIds) }
  });
  const variantGroupsById = createVariantGroupMap(variantGroups);

  const items = cart.items.map((line) => {
    const menuItem = byNumericId.get(Number(line.menuItemId));

    if (!menuItem) return null; // ghost item — menu item no longer exists

    let price = menuItem.basePrice;
    const resolvedVariantGroups = resolveVariantGroupsForMenuItem(menuItem, variantGroupsById);

    // Support legacy "options" if they exist
    if (menuItem.options && resolvedVariantGroups.length === 0) {
      line.selectedOptions.forEach((selection) => {
        const optionName = selection?.optionName || selection;
        const opt = menuItem.options.find((entry) => entry.label === optionName);
        if (opt) price += opt.priceDelta;
      });
    }

    price += calculateSelectedOptionsDelta(line.selectedOptions, resolvedVariantGroups);

    return {
      lineId: line._id,
      menuItemId: line.menuItemId,
      name: menuItem.name,
      image: menuItem.image,
      qty: line.qty,
      price: price,
      selectedOptions: sortSelectedOptionsForDisplay(line.selectedOptions, resolvedVariantGroups),
      instructions: line.instructions || "",
      isAvailable: !!menuItem.isAvailable,
    };
  }).filter(Boolean);

  const count = items.reduce((sum, x) => sum + (x.qty || 0), 0);

  return { cartId: cart.cartId, count, items };
}

export async function getCart(req, res) {
  try {
    const { cart, cartId } = await getExistingCart(req);
    if (!cart) {
      return res.json(emptyCartResponse());
    }

    const payload = await buildCartResponse(cart);

    // Prune ghost items (menu items that no longer exist) from the DB
    if (payload.items.length < cart.items.length) {
      const validLineIds = new Set(payload.items.map((i) => String(i.lineId)));
      const ghostIds = cart.items
        .filter((l) => !validLineIds.has(String(l._id)))
        .map((l) => l._id);
      ghostIds.forEach((id) => cart.items.pull(id));

      if (cart.items.length === 0) {
        await Cart.findOneAndDelete({ cartId });
        return res.json(emptyCartResponse());
      }
      await cart.save();
    }

    res.set("x-cart-id", cartId);
    res.json(payload);
  } catch {
    res.status(500).json({ error: "Failed to load cart" });
  }
}

export async function addToCart(req, res) {
  try {
    const { cart, cartId } = await getOrCreateWritableCart(req);

    const { menuItemId, qty = 1, selectedOptions = [], instructions = "" } = req.body || {};
    console.log("[CART ADD REQUEST]", {
      cartId,
      menuItemId,
      qty,
      rawOptions: req.body?.selectedOptions,
    });
    const nQty = Number(qty);
    const normalizedMenuItemId = Number(menuItemId);

    if (!Number.isFinite(normalizedMenuItemId) || !Number.isFinite(nQty) || nQty < 1) {
      return res.status(400).json({ error: "menuItemId and qty >= 1 are required" });
    }

    const menuItem = await MenuItem.findOne({ id: normalizedMenuItemId });

    if (!menuItem || !menuItem.isAvailable) {
      return res.status(400).json({ error: "Menu item not available" });
    }

    const opts = sanitizeSelectedOptions(selectedOptions);
    console.log("[CART SANITIZED OPTIONS]", opts);
    const inst = (instructions || "").trim();

    const existing = cart.items.find(
      (l) => Number(l.menuItemId) === normalizedMenuItemId &&
        sameSelectedOptions(l.selectedOptions, opts) &&
        (l.instructions || "").trim() === inst
    );
    const shouldMerge = Boolean(existing);
    console.log("[CART LINE DECISION]", {
      merge: shouldMerge,
      existingLineId: existing?._id ?? null,
    });

    if (existing) existing.qty += nQty;
    else cart.items.push({ menuItemId: normalizedMenuItemId, qty: nQty, selectedOptions: opts, instructions: inst });

    await cart.save();

    const payload = await buildCartResponse(cart);
    const cartTotal = payload.items.reduce(
      (sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 0)),
      0,
    );
    console.log("[CART STATE]", {
      lines: cart.items.length,
      totalItems: cart.items.reduce((a,i)=>a+i.qty,0),
      cartTotal,
    });
    res.set("x-cart-id", cartId);
    res.status(201).json(payload);
  } catch (err) {
    console.error("Add to cart error:", err);
    res.status(500).json({ error: "Failed to add to cart" });
  }
}
export async function updateCartItem(req, res) {
  try {
    const { cart, cartId } = await getExistingCart(req);
    if (!cart) return res.status(404).json({ error: "Cart not found" });

    const { lineId } = req.params;
    const { qty } = req.body;

    const item = cart.items.id(lineId);
    if (!item) return res.status(404).json({ error: "Item not found in cart" });

    const nQty = Number(qty);
    if (!Number.isFinite(nQty) || nQty <= 0) cart.items.pull(lineId);
    else item.qty = nQty;

    if (cart.items.length === 0) {
      await Cart.findOneAndDelete({ cartId });
      return res.json(emptyCartResponse());
    }

    await cart.save();
    const payload = await buildCartResponse(cart);
    res.set("x-cart-id", cartId);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: "Failed to update cart" });
  }
}

export async function removeFromCart(req, res) {
  try {
    const { cart, cartId } = await getExistingCart(req);
    if (!cart) {
      return res.json(emptyCartResponse());
    }

    const { lineId } = req.params;

    // Use pull to remove item by its subdocument _id
    cart.items.pull(lineId);

    if (cart.items.length === 0) {
      await Cart.findOneAndDelete({ cartId });
      return res.json(emptyCartResponse());
    }

    await cart.save();

    const payload = await buildCartResponse(cart);
    res.set("x-cart-id", cartId);
    res.json(payload);
  } catch (err) {
    console.error("Remove from cart error:", err);
    res.status(500).json({ error: "Failed to remove from cart" });
  }
}

export async function clearCart(req, res) {
  try {
    const { cart, cartId } = await getExistingCart(req);
    if (!cart) {
      return res.json(emptyCartResponse());
    }

    await Cart.findOneAndDelete({ cartId });
    res.json(emptyCartResponse());
  } catch (err) {
    res.status(500).json({ error: "Failed to clear cart" });
  }
}
