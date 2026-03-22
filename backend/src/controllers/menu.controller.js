import { MenuItem } from "../models/MenuItem.js";
import { VariantGroup } from "../models/VariantGroup.js";
import { Counter } from "../models/Counter.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * getNextMenuItemId
 *
 * Atomically increments the "menuItemId" counter and returns the next value.
 * Self-seeding: reads the current highest MenuItem.id and sets the counter
 * to at least that value before incrementing, so existing data stays consistent.
 * Safe under concurrent creates — findOneAndUpdate is a single atomic operation.
 */
async function getNextMenuItemId() {
  const lastItem = await MenuItem.findOne().sort({ id: -1 }).lean();
  const currentMax = lastItem?.id ?? 0;

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

/**
 * generateSlug
 *
 * Converts a name to a URL-friendly slug:
 *   "Frozen Yogurt Combo" → "frozen-yogurt-combo"
 *
 * Collision handling: if the base slug already exists (for a different item),
 * appends -2, -3, ... until a free slot is found.
 *
 * @param {string}      name        - Item name to slugify
 * @param {number|null} excludeId   - Numeric item id to exclude from the
 *                                    uniqueness check (pass the item's own id
 *                                    on update so it doesn't collide with itself)
 */
async function generateSlug(name, excludeId = null) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")   // strip special chars
    .replace(/\s+/g, "-")            // spaces → hyphens
    .replace(/-+/g, "-")             // collapse multiple hyphens
    .slice(0, 80);                   // max length

  let candidate = base;
  let suffix = 2;

  while (true) {
    const query = { slug: candidate };
    if (excludeId != null) query.id = { $ne: excludeId };

    const existing = await MenuItem.findOne(query).lean();
    if (!existing) return candidate;  // free — use it

    candidate = `${base}-${suffix}`;
    suffix++;
  }
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
      image = "",
      isAvailable,
      isFeatured,
    } = req.body;

    // slug is intentionally excluded from the body — auto-generated below
    const missingFields = [];
    if (!name)                        missingFields.push("name");
    if (!category)                    missingFields.push("category");
    if (!description)                 missingFields.push("description");
    if (basePrice === undefined)      missingFields.push("basePrice");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing or incorrect field(s): ${missingFields.join(", ")}`,
      });
    }

    const [newId, slug] = await Promise.all([
      getNextMenuItemId(),
      generateSlug(name),   // no excludeId needed on create
    ]);

    const newItem = new MenuItem({
      id: newId,
      name: name.trim(),
      slug,
      category: category.trim(),
      description: description.trim(),
      basePrice: parseFloat(basePrice),
      image: image.trim(),
      isAvailable: isAvailable !== false,
      isFeatured: isFeatured === true || isFeatured === "true",
      variantGroups: [],
    });

    await newItem.save();
    console.log(`✅ Created menu item: ${newItem.name} (ID: ${newId}, slug: ${slug})`);
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

export async function uploadMenuItemImage(req, res) {
  try {
    const { id } = req.params;
    console.log(`📥 POST /menu/${id}/image request received`);

    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image file provided" });
    }

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
    const numericId = parseInt(id);
    console.log(`📥 PATCH /menu/${id} request received with data:`, req.body);

    // Never allow changing the numeric id or manually setting slug
    delete req.body.id;
    delete req.body.slug;

    const allowedFields = [
      "name", "image", "category", "subcategory",
      "description", "basePrice", "isAvailable", "isFeatured", "variantGroups",
    ];
    const updateData = {};

    for (const field of allowedFields) {
      if (!(field in req.body)) continue;
      if (field === "basePrice") {
        updateData[field] = parseFloat(req.body[field]);
      } else if (field === "isAvailable" || field === "isFeatured") {
        updateData[field] = req.body[field] === true || req.body[field] === "true";
      } else if (Array.isArray(req.body[field])) {
        updateData[field] = req.body[field];
      } else {
        updateData[field] = req.body[field];
      }
    }

    // If name changed, regenerate slug — exclude this item from the uniqueness check
    if (updateData.name) {
      updateData.slug = await generateSlug(updateData.name, numericId);
      console.log(`🔄 Regenerated slug for "${updateData.name}": ${updateData.slug}`);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: "No valid fields to update" });
    }

    const updatedItem = await MenuItem.findOneAndUpdate(
      { id: numericId },
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