import { MenuItem } from "../models/MenuItem.js";

export async function getMenu(req, res) {
  try {
    console.log("📥 GET /menu request received");

    const items = await MenuItem.find({ isAvailable: true });

    console.log(`📤 Returning ${items.length} menu items`);
    res.status(200).json({ items });
  } catch (error) {
    console.error("❌ Failed to fetch menu:", error.message);

    res.status(500).json({
      error: "Failed to load menu. Please try again later.",
    });
  }
}
