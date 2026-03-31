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
// POST /api/menu -create new menu items (admin only)
export async function createMenuItem(req, res) {
  try {
    console.log("📥 POST /menu request received");
    const { name, category, description, basePrice, image, slug, isAvailable, isFeatured } = req.body;

    // Validate required fields
    const missingFields = [];

if (!name) missingFields.push("name");
if (!category) missingFields.push("category");
if (!description) missingFields.push("description");
if (basePrice === undefined) missingFields.push("basePrice");
if (!image) missingFields.push("image");
if (!slug) missingFields.push("slug");

if (missingFields.length > 0) {
  return res.status(400).json({
    success: false,
    error: `Missing or incorrect field(s): ${missingFields.join(", ")}`
  });
}

    // Generate next numeric ID
    const lastItem = await MenuItem.findOne().sort({ id: -1 });
    const newId = (lastItem?.id || 0) + 1;

    const newItem = new MenuItem({
      id: newId,
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      category: category.trim(),
      description: description.trim(),
      basePrice: parseFloat(basePrice),
      image: image.trim(),
      isAvailable: isAvailable !== false,
      isFeatured: isFeatured || false,
      variantGroups: [],
    });

    await newItem.save();

    console.log(`✅ Created menu item: ${newItem.name} (ID: ${newId})`);
    res.status(201).json({
      success: true,
      message: "Menu item created successfully",
      item: newItem,
    });
  } catch (error) {
    console.error("❌ Failed to create menu item:", error.message);
    res.status(400).json({
      success: false,
      error: error.message || "Failed to create menu item",
    });
  }
}

// PATCH /api/menu/:id - update menu items (admin only)
export async function updateMenuItem(req, res) {
  try {
    const { id } = req.params;
    console.log(`📥 PATCH /menu/${id} request received with data:`, req.body);

    // Prevent updating the numeric id field
    if (req.body.id) {
      delete req.body.id;
    }

    // Validate data types if provided
    const allowedFields = ['name', 'slug', 'image', 'category', 'subcategory', 'description', 'basePrice', 'isAvailable', 'isFeatured', 'variantGroups'];
    const updateData = {};

    for (const field of allowedFields) {
      if (field in req.body) {
        // Type validation
        if (field === 'basePrice') {
          updateData[field] = parseFloat(req.body[field]);
        } else if (field === 'isAvailable' || field === 'isFeatured') {
          updateData[field] = Boolean(req.body[field]);
        } else if (field === 'slug') {
          updateData[field] = req.body[field].trim().toLowerCase();
        } else if (Array.isArray(req.body[field])) {
          updateData[field] = req.body[field];
        } else {
          updateData[field] = req.body[field];
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid fields to update",
      });
    }

    // ✅ KEY FIX: Use findOneAndUpdate with proper write concern
    const updatedItem = await MenuItem.findOneAndUpdate(
      { id: parseInt(id) },
      { $set: updateData },
      { 
        new: true, 
        runValidators: true,
        writeConcern: { w: 1, j: true } // ✅ Ensure write is journaled
      }
    );

    if (!updatedItem) {
      return res.status(404).json({
        success: false,
        error: "Menu item not found",
      });
    }

    // ✅ CRITICAL FIX: Verify the update persisted by re-fetching
    const verifiedItem = await MenuItem.findOne({ id: parseInt(id) });
    if (!verifiedItem) {
      console.error("❌ PERSISTENCE ERROR: Item was not saved to database!");
      return res.status(500).json({
        success: false,
        error: "Failed to persist changes to database",
      });
    }

    console.log(`✅ Updated menu item: ${updatedItem.name}`, updateData);
    res.status(200).json({
      success: true,
      message: "Menu item updated successfully",
      item: updatedItem,
    });
  } catch (error) {
    console.error(`❌ Failed to update menu item ${req.params.id}:`, error.message);
    res.status(400).json({
      success: false,
      error: error.message || "Failed to update menu item",
    });
  }
}

// DELETE /api/menu/:id - delete menu item (admin only)
export async function deleteMenuItem(req, res) {
  try {
    const { id } = req.params;
    console.log(`📥 DELETE /menu/${id} request received`);

    const deletedItem = await MenuItem.findOneAndDelete(
      { id: parseInt(id) },
      { writeConcern: { w: 1, j: true } } // ✅ Ensure delete is journaled
    );

    if (!deletedItem) {
      return res.status(404).json({
        success: false,
        error: "Menu item not found",
      });
    }

    console.log(`🗑 Deleted menu item: ${deletedItem.name}`);
    res.status(200).json({
      success: true,
      message: "Menu item deleted successfully",
    });
  } catch (error) {
    console.error(`❌ Failed to delete menu item ${req.params.id}:`, error.message);
    res.status(500).json({
      success: false,
      error: "Failed to delete menu item",
    });
  }
}