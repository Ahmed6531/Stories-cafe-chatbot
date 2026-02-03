import { Order } from "../models/Order.js";
import { MenuItem } from "../models/MenuItem.js";
import { generateOrderNumber } from "../utils/orderNumber.js";

export async function createOrder(req, res) {
  const { orderType, customer, items, notesToBarista } = req.body || {};

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
    const { menuItemId, qty, selectedOptions = [] } = line || {};
    if (!menuItemId || !qty || qty < 1) {
      return res.status(400).json({ error: "Each item must include menuItemId and qty >= 1" });
    }

    const menuItem = await MenuItem.findById(menuItemId);
    if (!menuItem || !menuItem.isAvailable) {
      return res.status(400).json({ error: "Menu item not available" });
    }

    let optionsDelta = 0;
    for (const optLabel of selectedOptions) {
      const found = (menuItem.options || []).find((o) => o.label === optLabel);
      if (found) optionsDelta += found.priceDelta;
    }

    const unitPrice = menuItem.basePrice + optionsDelta;
    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;

    orderLines.push({
      menuItemId: menuItem._id,
      name: menuItem.name,
      qty,
      unitPrice,
      selectedOptions,
      lineTotal
    });
  }

  const total = subtotal;

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
