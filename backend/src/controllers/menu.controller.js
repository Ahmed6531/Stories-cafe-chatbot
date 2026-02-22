import { MenuItem } from "../models/MenuItem.js";

// GET /menu
export async function getMenu(req, res) {
  try {
    const items = await MenuItem.find({ isAvailable: true }).sort({ id: 1 });
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch menu" });
  }
}

// GET /menu/:id (numeric ID)
export async function getMenuItem(req, res) {
  try {
    const { id } = req.params;
    const item = await MenuItem.findOne({ id: Number(id) });
    if (!item) return res.status(404).json({ success: false, error: "Item not found" });
    res.json({ success: true, item });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch item" });
  }
}
