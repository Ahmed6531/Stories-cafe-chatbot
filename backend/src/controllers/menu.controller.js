import { MenuItem } from "../models/MenuItem.js";

export async function getMenu(req, res) {
  const items = await MenuItem.find({ isAvailable: true });
  res.json({ items });
}
