import { ComboAnalytics } from "../models/ComboAnalytics.js";
import { MenuItem } from "../models/MenuItem.js";

function parseNumericIds(values) {
  const rawValues = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(",")
      : [];

  return Array.from(
    new Set(
      rawValues
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value)),
    ),
  );
}

export async function observeCombo(req, res) {
  try {
    const anchorMenuItemIds = parseNumericIds(req.body?.anchorMenuItemIds);
    const suggestedMenuItemId = Number(req.body?.suggestedMenuItemId);
    const source = typeof req.body?.source === "string" && req.body.source.trim()
      ? req.body.source.trim()
      : "cart_add";

    if (!anchorMenuItemIds.length || !Number.isFinite(suggestedMenuItemId)) {
      return res.status(400).json({
        success: false,
        error: "anchorMenuItemIds and suggestedMenuItemId are required",
      });
    }

    const operations = anchorMenuItemIds
      .filter((anchorMenuItemId) => anchorMenuItemId !== suggestedMenuItemId)
      .map((anchorMenuItemId) => ({
        updateOne: {
          filter: { anchorMenuItemId, suggestedMenuItemId },
          update: {
            $inc: { count: 1 },
            $set: { lastSeenAt: new Date(), source },
          },
          upsert: true,
        },
      }));

    if (!operations.length) {
      return res.status(200).json({ success: true, observed: 0 });
    }

    await ComboAnalytics.bulkWrite(operations, { ordered: false });

    res.status(200).json({
      success: true,
      observed: operations.length,
    });
  } catch (error) {
    console.error("Failed to observe combo analytics:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to observe combo analytics",
    });
  }
}

export async function getTopCombos(req, res) {
  try {
    const anchorMenuItemIds = parseNumericIds(req.query.anchorMenuItemIds);
    const excludeMenuItemIds = parseNumericIds(req.query.excludeMenuItemIds);
    const limitValue = Number(req.query.limit);
    const limit = Number.isFinite(limitValue) && limitValue > 0
      ? Math.min(limitValue, 20)
      : 5;

    const filter = {
      suggestedMenuItemId: excludeMenuItemIds.length
        ? { $nin: excludeMenuItemIds }
        : { $exists: true },
    };

    if (anchorMenuItemIds.length) {
      filter.anchorMenuItemId = { $in: anchorMenuItemIds };
    }

    const combos = await ComboAnalytics.find(filter)
      .sort({ count: -1, lastSeenAt: -1 })
      .limit(limit)
      .lean();

    const menuItemIds = Array.from(
      new Set(
        combos.flatMap((combo) => [combo.anchorMenuItemId, combo.suggestedMenuItemId]),
      ),
    );
    const menuItems = await MenuItem.find({ id: { $in: menuItemIds } })
      .select("id name")
      .lean();
    const menuItemNames = new Map(menuItems.map((item) => [Number(item.id), item.name]));

    res.status(200).json({
      success: true,
      combos: combos.map((combo) => ({
        anchorMenuItemId: combo.anchorMenuItemId,
        anchorItemName: menuItemNames.get(combo.anchorMenuItemId) || null,
        suggestedMenuItemId: combo.suggestedMenuItemId,
        suggestedItemName: menuItemNames.get(combo.suggestedMenuItemId) || null,
        count: combo.count,
        lastSeenAt: combo.lastSeenAt,
        source: combo.source,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch combo analytics:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch combo analytics",
    });
  }
}