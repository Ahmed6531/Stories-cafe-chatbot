import { MenuItem } from "../models/menuItem.model.js";

export const renameCategory = async (req, res) => {
  const { oldName, newName } = req.body;

  if (!oldName || !newName) {
    return res.status(400).json({ message: "Both names required" });
  }

  try {
    const result = await MenuItem.updateMany(
      { category: oldName },
      { $set: { category: newName } }
    );

    res.json({
      message: "Category updated",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const result = await MenuItem.updateMany(
      { category: req.params.name },
      { $set: { category: "uncategorized" } }
    );

    res.json({
      message: "Category removed",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};