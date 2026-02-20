import { MenuItem } from "../models/MenuItem.js";
import { VariantGroup } from "../models/VariantGroup.js";

// GET /api/menu - Returns all menu items with minimal data
export async function getMenu(req, res) {
  try {
    console.log("📥 GET /menu request received");

    // Only return essential fields, exclude variantGroups from list view
    const items = await MenuItem.find({})
      .select(
        "id name slug image category description basePrice isAvailable isFeatured",
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

// GET /api/menu/:id - Returns single menu item with full variant data
export async function getMenuItem(req, res) {
  try {
    const { id } = req.params;
    console.log(`📥 GET /menu/${id} request received`);

    // Find the menu item by numeric ID
    const menuItem = await MenuItem.findOne({
      id: parseInt(id),
      isAvailable: true,
    });

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        error: "Menu item not found",
      });
    }

    // If item has no variant groups, return it as is
    if (!menuItem.variantGroups || menuItem.variantGroups.length === 0) {
      return res.status(200).json({
        success: true,
        item: menuItem.toObject(),
      });
    }

    // Fetch all variant groups referenced by this item
    const variantGroups = await VariantGroup.find({
      groupId: { $in: menuItem.variantGroups },
    });

    // Map variant groups to ensure they're in the correct order
    const orderedVariantGroups = menuItem.variantGroups
      .map((groupId) => {
        const group = variantGroups.find((g) => g.groupId === groupId);
        return group ? group.toObject() : null;
      })
      .filter((group) => group !== null); // Remove any null groups (if reference is invalid)

    // Create the response object with resolved variants
    const itemWithVariants = {
      ...menuItem.toObject(),
      variants: orderedVariantGroups,
    };

    // Remove the variantGroups array since we're using the resolved variants
    delete itemWithVariants.variantGroups;
    if (itemWithVariants.variantGroupOrder) {
      delete itemWithVariants.variantGroupOrder;
    }

    console.log(
      `📤 Returning menu item "${menuItem.name}" with ${orderedVariantGroups.length} variant groups`,
    );
    res.status(200).json({
      success: true,
      item: itemWithVariants,
    });
  } catch (error) {
    console.error(
      `❌ Failed to fetch menu item ${req.params.id}:`,
      error.message,
    );
    res.status(500).json({
      success: false,
      error: "Failed to load menu item. Please try again later.",
    });
  }
}

// Optional: GET /api/menu/featured - Returns featured items with full data
export async function getFeaturedMenu(req, res) {
  try {
    console.log("📥 GET /menu/featured request received");

    // Find featured items
    const featuredItems = await MenuItem.find({
      isFeatured: true,
      isAvailable: true,
    });

    // For each featured item, resolve its variants
    const itemsWithVariants = await Promise.all(
      featuredItems.map(async (item) => {
        if (!item.variantGroups || item.variantGroups.length === 0) {
          return {
            ...item.toObject(),
            variants: [],
          };
        }

        const variantGroups = await VariantGroup.find({
          groupId: { $in: item.variantGroups },
        });

        const orderedVariantGroups = item.variantGroups
          .map((groupId) => {
            const group = variantGroups.find((g) => g.groupId === groupId);
            return group ? group.toObject() : null;
          })
          .filter((group) => group !== null);

        const itemWithVariants = {
          ...item.toObject(),
          variants: orderedVariantGroups,
        };

        delete itemWithVariants.variantGroups;
        if (itemWithVariants.variantGroupOrder) {
          delete itemWithVariants.variantGroupOrder;
        }

        return itemWithVariants;
      }),
    );

    console.log(
      `📤 Returning ${itemsWithVariants.length} featured items with full data`,
    );
    res.status(200).json({
      success: true,
      count: itemsWithVariants.length,
      items: itemsWithVariants,
    });
  } catch (error) {
    console.error("❌ Failed to fetch featured menu:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to load featured menu. Please try again later.",
    });
  }
}
// GET /api/menu/category/:category - Returns all menu items by category
export async function getMenuByCategory(req, res) {
  try {
    const { category } = req.params;
    console.log(`📥 GET /menu/category/${category} request received`);

    // Find all items in this category - only return essential fields
    const items = await MenuItem.find({
      category: { $regex: new RegExp(`^${category}$`, "i") },
      isAvailable: true,
    })
      .select(
        "id name slug image category description basePrice isAvailable isFeatured",
      )
      .sort({ name: 1 });

    if (!items || items.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No items found in category: ${category}`,
      });
    }

    console.log(
      `📤 Returning ${items.length} items for category "${category}" (minimal data)`,
    );
    res.status(200).json({
      success: true,
      count: items.length,
      category: category,
      items: items,
    });
  } catch (error) {
    console.error(
      `❌ Failed to fetch menu items by category ${req.params.category}:`,
      error.message,
    );
    res.status(500).json({
      success: false,
      error: "Failed to load menu items by category. Please try again later.",
    });
  }
}
// POST /api/menu -create new menu items (admin only)
export async function createMenuItem(req,res){
  try {
    console.log("📥 POST /menu request received");

    const newItem = await MenuItem.create(req.body);

    console.log(`✅ Created menu item: ${newItem.name}`);

    res.status(201).json({
      success: true,
      item: newItem,
    });
  } catch (error) {
    console.error("❌ Failed to create menu item:", error.message);

    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}
//PATCH /api/menu/:id -update menu items (admin only)
export async function updateMenuItem(req,res){
  try{
    const { id } = req.params;
    console.log(`📥 PATCH /menu/${id} request received`);
    
    const updatedItem = await MenuItem.findOneAndUpdate(
      { id: parseInt(id) },
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedItem) {
      return res.status(404).json({
        success: false,
        error: "Menu item not found",
      });
    }
    console.log(`✅ Updated menu item: ${updatedItem.name}`);
    res.status(200).json({
      success: true,
      item: updatedItem,
    });
  } catch (error) {
    console.error(`❌ Failed to update menu item ${req.params.id}:`, error.message);
     res.status(400).json({
      success: false,
      error: error.message,
    });

  }
}
//DELETE /api/menu/:id -delete menu item (admin only)
export async function deleteMenuItem( req,res){
try{
  const { id } = req.params;
  console.log(`📥 DELETE /menu/${id} request received`);

  const deletedItem = await MenuItem.findOneAndDelete(
    {id: parseInt(id),}
  );
  if(!deletedItem){
    return res.status(404).json(
      {success: false,
      error: "Menu item not found",}
    );
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
//image uptdate and delete (admin only)
export const updateImage = async (req, res) => {
  const { image } = req.body;

  if (!image) {
    return res.status(400).json({ message: "Image required" });
  }

  try {
    const item = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { image },
      { new: true }
    );

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteImage = async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { $set: { image: "default.jpg" } },
      { new: true }
    );

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};