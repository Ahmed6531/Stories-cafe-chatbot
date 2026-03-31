import { Order } from "../models/Order.js";
import { MenuItem } from "../models/MenuItem.js";
import { Cart } from "../models/Cart.js";
import { VariantGroup } from "../models/VariantGroup.js";
import { generateOrderNumber } from "../utils/orderNumber.js";
import {
  calculateSelectedOptionsDelta,
  createVariantGroupMap,
  resolveVariantGroupsForMenuItem,
  sanitizeSelectedOptions,
} from "../utils/variantPricing.js";

const ORDER_TAX_RATE = 0.08;

export async function createOrder(req, res) {
  const { orderType, customer, items, notesToBarista } = req.body || {};
  const cartId = req.get("x-cart-id") || req.body.cartId;
  const userId = req.user?.id || null;

  console.log("[ORDER CREATE]", {
    orderType,
    itemCount: Array.isArray(items) ? items.length : 0,
    cartId,
  });

  if (!orderType || !["pickup", "dine_in"].includes(orderType)) {
    return res.status(400).json({ error: "Invalid orderType" });
  }
  if (!customer?.name || !customer?.phone) {
    return res.status(400).json({ error: "Customer name and phone are required" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Order items are required" });
  }

  const orderLines = [];
  let subtotal = 0;

  for (const line of items) {
    const { menuItemId, qty, selectedOptions = [], instructions = "" } = line || {};
    const numericMenuItemId = Number(menuItemId);
    if (!menuItemId || !qty || qty < 1) {
      return res.status(400).json({ error: "Each item must include menuItemId and qty >= 1" });
    }
    if (!Number.isFinite(numericMenuItemId)) {
      return res.status(400).json({ error: `Invalid menuItemId: ${menuItemId}. Backend expects numeric id.` });
    }

    const normalizedSelectedOptions = sanitizeSelectedOptions(selectedOptions);

    const menuItem = await MenuItem.findOne({ id: numericMenuItemId });
    if (!menuItem) {
      return res.status(400).json({ error: "Menu item not found" });
    }
    if (!menuItem.isAvailable) {
      return res.status(400).json({ error: "Menu item not available" });
    }

    let optionsDelta = 0;
    if (Array.isArray(menuItem.variantGroups) && menuItem.variantGroups.length > 0) {
      const variantGroups = await VariantGroup.find({
        groupId: { $in: menuItem.variantGroups },
      });
      const variantGroupsById = createVariantGroupMap(variantGroups);
      const resolvedVariantGroups = resolveVariantGroupsForMenuItem(menuItem, variantGroupsById);
      optionsDelta = calculateSelectedOptionsDelta(normalizedSelectedOptions, resolvedVariantGroups);
    } else {
      for (const selection of normalizedSelectedOptions) {
        const found = (menuItem.options || []).find((o) => o.label === selection.optionName);
        if (found) optionsDelta += found.priceDelta;
      }
    }

    const unitPrice = menuItem.basePrice + optionsDelta;
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;

    orderLines.push({
      menuItemId: numericMenuItemId,
      name: menuItem.name,
      qty,
      unitPrice,
      selectedOptions: normalizedSelectedOptions,
      instructions: instructions || "",
      lineTotal
    });
  }

  const tax = Math.round(subtotal * ORDER_TAX_RATE);
  const total = subtotal + tax;
  console.log("[ORDER TOTALS]", {
    subtotal,
    tax,
    total,
  });

  let orderNumber = generateOrderNumber();
  for (let i = 0; i < 3; i++) {
    const exists = await Order.findOne({ orderNumber });
    if (!exists) break;
    orderNumber = generateOrderNumber();
  }

  const order = await Order.create({
    userId: req.user?.id || null,
    orderNumber,
    userId,
    orderType,
    customer: {
      name: customer.name,
      phone: customer.phone,
      address: customer.address || ""
    },
    notesToBarista: notesToBarista || "",
    items: orderLines,
    subtotal,
    total
  });

  if (cartId) {
    const deletedCart = await Cart.findOneAndDelete({ cartId });
    console.log("[CART DELETE]", {
      cartId,
      success: !!deletedCart,
    });
  }

  res.status(201).json({
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: order.total
  });
}

export async function listOrders(req, res) {
  const { status, orderType } = req.query;

  const filter = {};

  const validStatuses = ["received", "in_progress", "completed", "cancelled"];
  const validTypes = ["pickup", "dine_in"];

  if (status && validStatuses.includes(status)) {
    filter.status = status;
  }

  if (orderType && validTypes.includes(orderType)) {
    filter.orderType = orderType;
  }

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({ orders });
}

export async function getMyOrders(req, res) {
  const orders = await Order.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .limit(20);

  res.json({ orders });
}

export async function updateOrderStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ["received", "in_progress", "completed", "cancelled"];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid status" } });
  }

  try {
    const order = await Order.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!order) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Order not found" } });
    }

    res.json({
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status
      }
    });
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update order status" } });
  }
}