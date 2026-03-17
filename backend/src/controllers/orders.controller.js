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

  if (!orderType || !["pickup", "dine_in", "delivery"].includes(orderType)) {
    return res.status(400).json({ error: "Invalid orderType" });
  }
  if (!customer?.name || !customer?.phone) {
    return res.status(400).json({ error: "Customer name and phone are required" });
  }
  if (orderType === "delivery" && !customer?.address) {
    return res.status(400).json({ error: "Address is required for delivery" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Order items are required" });
  }

  const orderLines = [];
  let subtotal = 0;

  for (const line of items) {
    const { menuItemId, qty, selectedOptions = [], instructions = "" } = line || {};
    if (!menuItemId || !qty || qty < 1) {
      return res.status(400).json({ error: "Each item must include menuItemId and qty >= 1" });
    }

    const normalizedSelectedOptions = sanitizeSelectedOptions(selectedOptions);

    const menuItem = await MenuItem.findById(menuItemId);
    if (!menuItem) {
      if (!isNaN(menuItemId)) {
        return res.status(400).json({ error: `Invalid menuItemId: ${menuItemId}. Backend expects Mongo _id (ObjectId), not numeric id.` });
      }
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
      menuItemId: menuItem._id,
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

  let orderNumber = generateOrderNumber();
  for (let i = 0; i < 3; i++) {
    const exists = await Order.findOne({ orderNumber });
    if (!exists) break;
    orderNumber = generateOrderNumber();
  }

  const order = await Order.create({
    orderNumber,
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
    await Cart.findOneAndDelete({ cartId });
  }

  res.status(201).json({
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: order.total
  });
}

export async function listOrders(req, res) {
  const orders = await Order.find().sort({ createdAt: -1 }).limit(50);
  res.json({ orders });
}
