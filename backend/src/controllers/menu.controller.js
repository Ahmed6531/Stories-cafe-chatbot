import { MenuItem } from "../models/MenuItem.js";
import { VariantGroup } from "../models/VariantGroup.js";

// GET /menu/categories - Returns distinct top-level categories
export async function getMenuCategories(req, res) {
  try {
    const categories = await MenuItem.distinct("category", {
      category: { $exists: true, $ne: null },
    });

    res.status(200).json({
      success: true,
      categories: categories.filter(Boolean).sort(),
    });
  } catch (error) {
    console.error("Failed to fetch menu categories:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to load menu categories.",
    });
  }
}

// GET /menu - Returns all menu items with minimal data
export async function getMenu(req, res) {
  try {
    console.log("📥 GET /menu request received");

    // Only return essential fields, exclude variantGroups from list view
    const items = await MenuItem.find({})
      .select(
        "id name slug image category subcategory description basePrice isAvailable isFeatured",
      )
      .sort({ category: 1, name: 1 });

    console.log(`📤 Returning ${items.length} menu items (minimal data)`);
    res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error("❌ Failed to fetch menu:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to load menu. Please try again later.",
    });
  }
}

// GET /menu/:id - Returns single menu item with full variant data
export async function getMenuItem(req, res) {
  try {
    const { id } = req.params;
    console.log(`📥 GET /menu/${id} request received`);

    // Find the menu item by numeric ID
    const menuItem = await MenuItem.findOne({
      id: parseInt(id)
    });

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        error: "Menu item not found",
      });
    }

    // Resolve variantGroups if present
    let itemResponse = menuItem.toObject();
    if (menuItem.variantGroups && menuItem.variantGroups.length > 0) {
      const variantGroups = await VariantGroup.find({
        groupId: { $in: menuItem.variantGroups },
      });

      const orderedVariantGroups = menuItem.variantGroups
        .map((groupId) => {
          const group = variantGroups.find((g) => g.groupId === groupId);
          return group ? group.toObject() : null;
        })
        .filter((group) => group !== null);

      itemResponse.variants = orderedVariantGroups;
      // We keep variantGroups field too for flexibility, or we can delete it
    }

    console.log(
      `📤 Returning menu item "${menuItem.name}" with ${itemResponse.variants?.length || 0} variant groups`,
    );

    res.status(200).json({
      success: true,
      item: itemResponse,
    });
  } catch (error) {
    console.error(`❌ Failed to fetch menu item ${req.params.id}:`, error.message);
    res.status(500).json({
      success: false,
      error: "Failed to load menu item.",
    });
  }
}

// GET /menu/featured - Returns featured items with list-view data
export async function getFeaturedMenu(req, res) {
  try {
    const featuredItems = await MenuItem.find({
      isFeatured: true,
      isAvailable: true,
    }).select(
      "id name slug image category subcategory description basePrice isAvailable isFeatured",
    );

    res.status(200).json({
      success: true,
      count: featuredItems.length,
      items: featuredItems,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to load featured menu.",
    });
  }
}

// GET /menu/category/:category - Returns all menu items by category
export async function getMenuByCategory(req, res) {
  try {
    const { category } = req.params;
    const items = await MenuItem.find({
      category: { $regex: new RegExp(`^${category}$`, "i") },
    });

    res.status(200).json({
      success: true,
      count: items.length,
      category: category,
      items: items,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to load items by category.",
    });
  }
}
