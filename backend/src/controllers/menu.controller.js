import { MenuItem } from "../models/MenuItem.js";
import { VariantGroup } from "../models/VariantGroup.js";
import { Counter } from "../models/Counter.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * getNextMenuItemId
 *
 * Atomically increments the "menuItemId" counter and returns the next value.
 *
 * Self-seeding: on first call the aggregation pipeline reads the current
 * highest MenuItem.id from the DB and sets the counter to at least that
 * value before incrementing. This means existing documents are never
 * assigned a duplicate ID.
 *
 * Safe under concurrent creates: findOneAndUpdate is a single atomic
 * operation in MongoDB; two simultaneous calls will always receive
 * different values.
 */
async function getNextMenuItemId() {
  // Read current max id from existing items (only needed for seeding)
  const lastItem = await MenuItem.findOne().sort({ id: -1 }).lean();
  const currentMax = lastItem?.id ?? 0;

  // Aggregation-pipeline update (MongoDB ≥ 4.2):
  //   seq = max(existing_seq, currentMax) + 1
  // If the counter doc doesn't exist yet, $seq resolves to 0 so the result
  // is max(0, currentMax) + 1.
  const counter = await Counter.findOneAndUpdate(
    { _id: "menuItemId" },
    [
      {
        $set: {
          seq: {
            $add: [{ $max: ["$seq", currentMax] }, 1],
          },
        },
      },
    ],
    { new: true, upsert: true }
  );

  return counter.seq;
}

// ─── GET /menu/categories ─────────────────────────────────────────────────────

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
    res.status(500).json({ success: false, error: "Failed to load menu categories." });
  }
}

// ─── GET /menu ────────────────────────────────────────────────────────────────

export async function getMenu(req, res) {
  try {
    console.log("📥 GET /menu request received");
    const items = await MenuItem.find({})
      .select(
        "id name slug image category subcategory description basePrice isAvailable isFeatured"
      )
      .sort({ category: 1, name: 1 });
    console.log(`📤 Returning ${items.length} menu items`);
    res.status(200).json({ success: true, count: items.length, items });
  } catch (error) {
    console.error("❌ Failed to fetch menu:", error.message);
    res.status(500).json({ success: false, error: "Failed to load menu. Please try again later." });
  }
}

// ─── GET /menu/:id ────────────────────────────────────────────────────────────

export async function getMenuItem(req, res) {
  try {
    const { id } = req.params;
    console.log(`📥 GET /menu/${id} request received`);
    const menuItem = await MenuItem.findOne({ id: parseInt(id) });
    if (!menuItem) {
      return res.status(404).json({ success: false, error: "Menu item not found" });
    }
    let itemResponse = menuItem.toObject();
    if (menuItem.variantGroups?.length > 0) {
      const variantGroups = await VariantGroup.find({
        groupId: { $in: menuItem.variantGroups },
      });
      itemResponse.variants = menuItem.variantGroups
        .map((groupId) => {
          const group = variantGroups.find((g) => g.groupId === groupId);
          return group ? group.toObject() : null;
        })
        .filter(Boolean);
    }
    console.log(
      `📤 Returning menu item "${menuItem.name}" with ${itemResponse.variants?.length || 0} variant groups`
    );
    res.status(200).json({ success: true, item: itemResponse });
  } catch (error) {
    console.error(`❌ Failed to fetch menu item ${req.params.id}:`, error.message);
    res.status(500).json({ success: false, error: "Failed to load menu item." });
  }
}

// ─── GET /menu/featured ───────────────────────────────────────────────────────

export async function getFeaturedMenu(req, res) {
  try {
    const featuredItems = await MenuItem.find({
      isFeatured: true,
      isAvailable: true,
    }).select(
      "id name slug image category subcategory description basePrice isAvailable isFeatured"
    );
    res.status(200).json({ success: true, count: featuredItems.length, items: featuredItems });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to load featured menu." });
  }
}

// ─── GET /menu/category/:category ────────────────────────────────────────────

export async function getMenuByCategory(req, res) {
  try {
    const { category } = req.params;
    const items = await MenuItem.find({
      category: { $regex: new RegExp(`^${category}$`, "i") },
    });
    res.status(200).json({ success: true, count: items.length, category, items });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to load items by category." });
  }
}

// ─── POST /menu ───────────────────────────────────────────────────────────────

export async function createMenuItem(req, res) {
  try {
    console.log("📥 POST /menu request received");
    const {
      name,
      category,
      description,
      basePrice,
      image = "",   // no longer required at create time — upload comes separately
      slug,
      isAvailable,
      isFeatured,
    } = req.body;

    const missingFields = [];
    if (!name) missingFields.push("name");
    if (!category) missingFields.push("category");
    if (!description) missingFields.push("description");
    if (basePrice === undefined) missingFields.push("basePrice");
    if (!slug) missingFields.push("slug");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing or incorrect field(s): ${missingFields.join(", ")}`,
      });
    }

    // ✅ Atomic ID — no race condition
    const newId = await getNextMenuItemId();

    const newItem = new MenuItem({
      id: newId,
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      category: category.trim(),
      description: description.trim(),
      basePrice: parseFloat(basePrice),
      image: image.trim(),
      isAvailable: isAvailable !== false,
      isFeatured: isFeatured === true || isFeatured === "true",
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
    res.status(400).json({ success: false, error: error.message || "Failed to create menu item" });
  }
}

// ─── POST /menu/:id/image ─────────────────────────────────────────────────────

/**
 * uploadMenuItemImage
 *
 * Called after createMenuItem (or to replace an existing image).
 * Expects multer to have already processed the file — see upload.middleware.js.
 *
 * Stores an absolute URL so any <img src={item.image} /> works without
 * knowing which host the backend is on.
 */
export async function uploadMenuItemImage(req, res) {
  try {
    const { id } = req.params;
    console.log(`📥 POST /menu/${id}/image request received`);

    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image file provided" });
    }

    // Build absolute URL from the incoming request
    const imageUrl = `${req.protocol}://${req.get("host")}/images/${req.file.filename}`;

    const updatedItem = await MenuItem.findOneAndUpdate(
      { id: parseInt(id) },
      { $set: { image: imageUrl } },
      { new: true, runValidators: false }
    );

    if (!updatedItem) {
      return res.status(404).json({ success: false, error: "Menu item not found" });
    }

    console.log(`✅ Image uploaded for item ${id}: ${imageUrl}`);
    res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      imageUrl,
      item: updatedItem,
    });
  } catch (error) {
    console.error(`❌ Failed to upload image for item ${req.params.id}:`, error.message);
    res.status(500).json({ success: false, error: "Failed to upload image" });
  }
}

// ─── PATCH /menu/:id ──────────────────────────────────────────────────────────

export async function updateMenuItem(req, res) {
  try {
    const { id } = req.params;
    console.log(`📥 PATCH /menu/${id} request received with data:`, req.body);

    // Never allow changing the numeric id
    delete req.body.id;

    const allowedFields = [
      "name", "slug", "image", "category", "subcategory",
      "description", "basePrice", "isAvailable", "isFeatured", "variantGroups",
    ];
    const updateData = {};

    for (const field of allowedFields) {
      if (!(field in req.body)) continue;
      if (field === "basePrice") {
        updateData[field] = parseFloat(req.body[field]);
      } else if (field === "isAvailable" || field === "isFeatured") {
        updateData[field] = req.body[field] === true || req.body[field] === "true";
      } else if (field === "slug") {
        updateData[field] = req.body[field].trim().toLowerCase();
      } else if (Array.isArray(req.body[field])) {
        updateData[field] = req.body[field];
      } else {
        updateData[field] = req.body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: "No valid fields to update" });
    }

    const updatedItem = await MenuItem.findOneAndUpdate(
      { id: parseInt(id) },
      { $set: updateData },
      { new: true, runValidators: true, writeConcern: { w: 1, j: true } }
    );

    if (!updatedItem) {
      return res.status(404).json({ success: false, error: "Menu item not found" });
    }

    console.log(`✅ Updated menu item: ${updatedItem.name}`, updateData);
    res.status(200).json({
      success: true,
      message: "Menu item updated successfully",
      item: updatedItem,
    });
  } catch (error) {
    console.error(`❌ Failed to update menu item ${req.params.id}:`, error.message);
    res.status(400).json({ success: false, error: error.message || "Failed to update menu item" });
  }
}

// ─── DELETE /menu/:id ─────────────────────────────────────────────────────────

export async function deleteMenuItem(req, res) {
  try {
    const { id } = req.params;
    console.log(`📥 DELETE /menu/${id} request received`);
    const deletedItem = await MenuItem.findOneAndDelete(
      { id: parseInt(id) },
      { writeConcern: { w: 1, j: true } }
    );
    if (!deletedItem) {
      return res.status(404).json({ success: false, error: "Menu item not found" });
    }
    console.log(`🗑 Deleted menu item: ${deletedItem.name}`);
    res.status(200).json({ success: true, message: "Menu item deleted successfully" });
  } catch (error) {
    console.error(`❌ Failed to delete menu item ${req.params.id}:`, error.message);
    res.status(500).json({ success: false, error: "Failed to delete menu item" });
  }
}