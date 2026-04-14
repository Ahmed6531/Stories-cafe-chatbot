import { connectDB } from "../config/db.js";
import { ComboAnalytics } from "../models/ComboAnalytics.js";
import { Order } from "../models/Order.js";

function buildPairOperations(orderItems) {
  const uniqueMenuItemIds = Array.from(
    new Set(
      (orderItems || [])
        .map((item) => Number(item?.menuItemId))
        .filter((itemId) => Number.isFinite(itemId)),
    ),
  );

  const operations = [];

  for (const anchorMenuItemId of uniqueMenuItemIds) {
    for (const suggestedMenuItemId of uniqueMenuItemIds) {
      if (anchorMenuItemId === suggestedMenuItemId) {
        continue;
      }

      operations.push({
        updateOne: {
          filter: { anchorMenuItemId, suggestedMenuItemId },
          update: {
            $inc: { count: 1 },
            $set: { lastSeenAt: new Date(), source: "order_backfill" },
          },
          upsert: true,
        },
      });
    }
  }

  return operations;
}

async function run() {
  await connectDB();

  const orders = await Order.find({ "items.0": { $exists: true } })
    .select("items")
    .lean();

  let processedOrders = 0;
  let operationsApplied = 0;

  for (const order of orders) {
    const operations = buildPairOperations(order.items);
    if (!operations.length) {
      continue;
    }

    await ComboAnalytics.bulkWrite(operations, { ordered: false });
    processedOrders += 1;
    operationsApplied += operations.length;
  }

  console.log(JSON.stringify({
    success: true,
    ordersScanned: orders.length,
    ordersContributed: processedOrders,
    operationsApplied,
  }, null, 2));
}

run()
  .catch((error) => {
    console.error("Combo analytics backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await ComboAnalytics.db.close();
    } catch {
      // ignore close errors on shutdown
    }
  });