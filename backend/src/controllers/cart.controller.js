import crypto from "crypto";
import { Cart } from "../models/Cart.js";
import { MenuItem } from "../models/MenuItem.js";

function makeCartId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
}

function normalizeOptions(opts) {
  if (!Array.isArray(opts)) return [];
  return opts.map(String).sort();
}

function sameOptions(a, b) {
  const A = normalizeOptions(a);
  const B = normalizeOptions(b);
  if (A.length !== B.length) return false;
  for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return false;
  return true;
}

async function getOrCreateCart(req) {
  let cartId = req.get("x-cart-id") || req.query.cartId;

  if (!cartId) {
    cartId = makeCartId();
    const cart = await Cart.create({ cartId, items: [] });
    return { cart, cartId };
  }

  let cart = await Cart.findOne({ cartId });
  if (!cart) cart = await Cart.create({ cartId, items: [] });

  return { cart, cartId };
}

async function buildCartResponse(cart) {
  const ids = cart.items.map((x) => x.menuItemId);

  // Lookup by both MongoDB _id and numeric id, robust to type mismatches
  const menuItems = await MenuItem.find({
    $or: [
      { _id: { $in: ids.filter(id => id && String(id).match(/^[0-9a-fA-F]{24}$/)) } },
      { id: { $in: ids.filter(id => id && !isNaN(Number(id))).map(Number) } }
    ]
  });

  // Build lookup maps for all possible id representations
  const byMongoId = new Map(menuItems.map((m) => [String(m._id), m]));
  const byNumericId = new Map(menuItems.map((m) => [String(m.id), m]));
  // Also allow matching menuItemId as stringified number (for legacy carts)
  const byStringId = new Map(menuItems.map((m) => [String(m.id), m]));

  const items = cart.items.map((line) => {
    // Try all possible id matches
    let menuItem = byMongoId.get(String(line.menuItemId))
      || byNumericId.get(Number(line.menuItemId))
      || byStringId.get(String(line.menuItemId));

    let price = menuItem ? menuItem.basePrice : 0;

    // Calculate options delta
    if (menuItem && menuItem.options) {
      line.selectedOptions.forEach(optLabel => {
        const opt = menuItem.options.find(o => o.label === optLabel);
        if (opt) price += opt.priceDelta;
      });
    }

    return {
      lineId: line._id,
      menuItemId: line.menuItemId,
      name: menuItem ? menuItem.name : "Unknown item",
      image: menuItem ? menuItem.image : undefined,
      qty: line.qty,
      price: price,
      selectedOptions: normalizeOptions(line.selectedOptions),
      instructions: line.instructions || "",
      isAvailable: menuItem ? !!menuItem.isAvailable : false
    };
  });

  const count = items.reduce((sum, x) => sum + (x.qty || 0), 0);

  return { cartId: cart.cartId, count, items };
}

export async function getCart(req, res) {
  try {
    const { cart, cartId } = await getOrCreateCart(req);
    const payload = await buildCartResponse(cart);
    res.set("x-cart-id", cartId);
    res.json(payload);
  } catch {
    res.status(500).json({ error: "Failed to load cart" });
  }
}

export async function addToCart(req, res) {
  try {
    const { cart, cartId } = await getOrCreateCart(req);

    const { menuItemId, qty = 1, selectedOptions = [], instructions = "" } = req.body || {};
    const nQty = Number(qty);

    if (!menuItemId || !Number.isFinite(nQty) || nQty < 1) {
      return res.status(400).json({ error: "menuItemId and qty >= 1 are required" });
    }

    const isMongoId = String(menuItemId).match(/^[0-9a-fA-F]{24}$/);
    const menuItem = isMongoId
      ? await MenuItem.findById(menuItemId)
      : await MenuItem.findOne({ id: Number(menuItemId) });

    if (!menuItem || !menuItem.isAvailable) {
      return res.status(400).json({ error: "Menu item not available" });
    }

    const opts = normalizeOptions(selectedOptions);
    const inst = (instructions || "").trim();

    const existing = cart.items.find(
      (l) => String(l.menuItemId) === String(menuItemId) &&
        sameOptions(l.selectedOptions, opts) &&
        (l.instructions || "").trim() === inst
    );

    if (existing) existing.qty += nQty;
    else cart.items.push({ menuItemId, qty: nQty, selectedOptions: opts, instructions: inst });

    await cart.save();

    const payload = await buildCartResponse(cart);
    res.set("x-cart-id", cartId);
    res.status(201).json(payload);
  } catch {
    res.status(500).json({ error: "Failed to add to cart" });
  }
}
export async function updateCartItem(req, res) {
  try {
    const { cart, cartId } = await getOrCreateCart(req);
    const { lineId } = req.params;
    const { qty } = req.body;

    const item = cart.items.id(lineId);
    if (!item) return res.status(404).json({ error: "Item not found in cart" });

    if (qty <= 0) cart.items.pull(lineId);
    else item.qty = qty;

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
    const { cart, cartId } = await getOrCreateCart(req);
    const { lineId } = req.params;

    // Use pull to remove item by its subdocument _id
    cart.items.pull(lineId);
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
    const { cart, cartId } = await getOrCreateCart(req);
    cart.items = [];
    await cart.save();

    const payload = await buildCartResponse(cart);
    res.set("x-cart-id", cartId);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: "Failed to clear cart" });
  }
}
