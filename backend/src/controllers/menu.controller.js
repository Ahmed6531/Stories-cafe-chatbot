import { MenuItem } from "../models/MenuItem.js";
import { VariantGroup } from "../models/VariantGroup.js";
import { Category } from "../models/Category.js";
import { Counter } from "../models/Counter.js";
import { deleteGCSImage } from "../middleware/upload.js";
import {
  createVariantGroupRefMap,
  getCanonicalVariantGroupRef,
  normalizeVariantGroupRefs,
} from "../utils/variantGroupRefs.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * getNextMenuItemId
 *
 * Issues a guaranteed-unique numeric ID for a new MenuItem.
 * Uses plain $inc — compatible with all Mongoose/MongoDB versions.
 */
async function getNextMenuItemId() {
  const lastItem = await MenuItem.findOne().sort({ id: -1 }).lean();
  const currentMax = lastItem?.id ?? 0;

  await Counter.findOneAndUpdate(
    { _id: "menuItemId" },
    { $setOnInsert: { seq: currentMax } },
    { upsert: true }
  );

  await Counter.updateOne(
    { _id: "menuItemId", seq: { $lt: currentMax } },
    { $set: { seq: currentMax } }
  );

  const counter = await Counter.findOneAndUpdate(
    { _id: "menuItemId" },
    { $inc: { seq: 1 } },
    { new: true }
  );

  return counter.seq;
}

/**
 * generateSlug
 *
 * Converts a name to a URL-friendly slug, with collision handling.
 * "Frozen Yogurt Combo" → "frozen-yogurt-combo" (or "-2", "-3" if taken)
 *
 * @param {string}      name      - Item name to slugify
 * @param {number|null} excludeId - Exclude this item's own id from uniqueness check (on update)
 */
async function generateSlug(name, excludeId = null) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

  let candidate = base;
  let suffix = 2;

  while (true) {
    const query = { slug: candidate };
    if (excludeId != null) query.id = { $ne: excludeId };
    const existing = await MenuItem.findOne(query).lean();
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix++;
  }
}

function serializeInvalidVariantGroups(invalidGroups = []) {
  return invalidGroups.map((entry) => ({
    ...entry,
    groupId: entry.groupId || entry.groupRef || null,
  }));
}

function findVariantGroupByRef(groupRef, groupsByRef) {
  return groupsByRef.get(String(groupRef)) || null;
}

function getVariantGroupCategoryId(group) {
  return group?.categoryId || group?.ctagId || null;
}

async function validateVariantGroupsForCategory({ categoryId, variantGroups, context }) {
  const normalizedRefs = normalizeVariantGroupRefs(variantGroups);

  if (normalizedRefs.length === 0) {
    console.log("[menu/variant-groups/validate]", {
      context,
      categoryId: String(categoryId),
      requestedGroupRefs: [],
      matchedGroups: [],
      invalidGroups: [],
    });
    return { validGroupRefs: [], invalidGroups: [] };
  }

  const matchedGroups = await VariantGroup.find({
    $or: [
      { groupId: { $in: normalizedRefs } },
      { refId: { $in: normalizedRefs } },
    ],
  })
    .select("refId groupId adminName name categoryId ctagId isActive")
    .lean();

  const groupsByRef = createVariantGroupRefMap(matchedGroups);

  const invalidGroups = normalizedRefs
    .map((groupRef) => {
      const group = groupsByRef.get(groupRef);
      if (!group) {
        return { groupRef, reason: "unknown" };
      }

      if (group.isActive === false) {
        return { groupRef, reason: "deleted" };
      }

      const resolvedCategoryId = getVariantGroupCategoryId(group);
      if (!resolvedCategoryId || String(resolvedCategoryId) !== String(categoryId)) {
        return {
          groupRef,
          reason: "wrong-category",
          groupCategoryId: resolvedCategoryId ? String(resolvedCategoryId) : null,
        };
      }

      return null;
    })
    .filter(Boolean);

  console.log("[menu/variant-groups/validate]", {
    context,
    categoryId: String(categoryId),
    requestedGroupRefs: normalizedRefs,
    matchedGroups: matchedGroups.map((group) => ({
      refId: group.refId || null,
      groupId: group.groupId,
    })),
    matchedCategoryRefs: matchedGroups.map((group) => ({
      refId: group.refId ? String(group.refId) : null,
      groupId: group.groupId,
      categoryId: group.categoryId ? String(group.categoryId) : null,
      ctagId: group.ctagId ? String(group.ctagId) : null,
      isActive: group.isActive !== false,
    })),
    invalidGroups,
  });

  return {
    validGroupRefs: normalizedRefs
      .filter((groupRef) => !invalidGroups.some((entry) => entry.groupRef === groupRef))
      .map((groupRef) => {
        const group = groupsByRef.get(groupRef);
        return getCanonicalVariantGroupRef(group) || groupRef;
      }),
    invalidGroups,
  };
}

// ─── GET /menu/categories ─────────────────────────────────────────────────────

export async function getMenuCategories(req, res) {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ order: 1, name: 1 })
      .select("name slug image subcategories")
      .lean();
    res.status(200).json({ success: true, categories });
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
      .populate("category", "name slug image subcategories")
      .select("id name slug image category subcategory description basePrice isAvailable isFeatured variantGroups")
      .sort({ name: 1 });
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
    const menuItem = await MenuItem.findOne({ id: parseInt(id) })
      .populate("category", "name slug image subcategories");
    if (!menuItem) {
      return res.status(404).json({ success: false, error: "Menu item not found" });
    }
    let itemResponse = menuItem.toObject();
    if (menuItem.variantGroups?.length > 0) {
      const variantGroups = await VariantGroup.find({
        $or: [
          { groupId: { $in: menuItem.variantGroups } },
          { refId: { $in: menuItem.variantGroups } },
        ],
        isActive: { $ne: false },
      });
      const groupsByRef = createVariantGroupRefMap(variantGroups);
      itemResponse.variants = menuItem.variantGroups
        .map((groupRef) => {
          const group = findVariantGroupByRef(groupRef, groupsByRef);
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
    })
      .populate("category", "name slug image subcategories")
      .select("id name slug image category subcategory description basePrice isAvailable isFeatured");
    res.status(200).json({ success: true, count: featuredItems.length, items: featuredItems });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to load featured menu." });
  }
}

// ─── GET /menu/category/:category ────────────────────────────────────────────

// :category param is now a category slug (e.g. "coffee"), not a display name.
export async function getMenuByCategory(req, res) {
  try {
    const { category: slug } = req.params;
    const categoryDoc = await Category.findOne({ slug, isActive: true }).lean();
    if (!categoryDoc) {
      return res.status(404).json({ success: false, error: "Category not found." });
    }
    const items = await MenuItem.find({ category: categoryDoc._id })
      .populate("category", "name slug image subcategories");
    res.status(200).json({
      success: true,
      count: items.length,
      category: categoryDoc,
      items,
    });
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
      categoryId,
      subcategory = null,
      description,
      basePrice,
      image = "",
      isAvailable,
      isFeatured,
      variantGroups = [],
    } = req.body;

    console.log("[menu/create] payload", {
      categoryId,
      variantGroupRefs: normalizeVariantGroupRefs(variantGroups),
    });

    const missingFields = [];
    if (!name)                   missingFields.push("name");
    if (!categoryId)             missingFields.push("categoryId");
    if (!description)            missingFields.push("description");
    if (basePrice === undefined) missingFields.push("basePrice");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing or incorrect field(s): ${missingFields.join(", ")}`,
      });
    }

    const categoryDoc = await Category.findById(categoryId).lean();
    if (!categoryDoc) {
      return res.status(400).json({ success: false, error: "Category not found." });
    }

    const {
      validGroupRefs,
      invalidGroups,
    } = await validateVariantGroupsForCategory({
      categoryId: categoryDoc._id,
      variantGroups,
      context: "create",
    });

    if (invalidGroups.length > 0) {
      return res.status(400).json({
        success: false,
        error: "One or more variant groups are invalid for the selected category.",
        invalidVariantGroups: serializeInvalidVariantGroups(invalidGroups),
      });
    }

    const [newId, slug] = await Promise.all([
      getNextMenuItemId(),
      generateSlug(name),
    ]);

    const newItem = new MenuItem({
      id: newId,
      name: name.trim(),
      slug,
      category: categoryDoc._id,
      subcategory: subcategory || null,
      description: description.trim(),
      basePrice: parseFloat(basePrice),
      image: image.trim(),
      isAvailable: isAvailable !== false,
      isFeatured: isFeatured === true || isFeatured === "true",
      variantGroups: normalizeVariantGroupRefs(validGroupRefs),
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

/**
 * uploadMenuItemImage
 *
 * Multer has already processed the file and uploaded it to GCS before this runs.
 * req.file.path is the full GCS public URL set by upload.middleware.js.
 * We delete the old image from GCS (if any), then patch the DB.
 */
export async function uploadMenuItemImage(req, res) {
  try {
    const { id } = req.params;
    console.log(`📥 POST /menu/${id}/image request received`);

    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image file provided" });
    }

    // Delete old GCS image before overwriting the DB field
    const existing = await MenuItem.findOne({ id: parseInt(id) }).lean();
    if (existing?.image) {
      await deleteGCSImage(existing.image);
    }

    // upload.middleware.js sets req.file.path to the public GCS URL after upload
    const imageUrl = req.file.path;

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

    delete req.body.id;
    delete req.body.slug;

    const allowedFields = [
      "name", "image", "subcategory",
      "description", "basePrice", "isAvailable", "isFeatured", "variantGroups",
    ];
    const updateData = {};
    let resolvedCategoryId = null;

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

    // categoryId handled separately — must resolve to an existing Category ObjectId
    if ("categoryId" in req.body) {
      const categoryDoc = await Category.findById(req.body.categoryId).lean();
      if (!categoryDoc) {
        return res.status(400).json({ success: false, error: "Category not found." });
      }
      resolvedCategoryId = categoryDoc._id;
      updateData.category = categoryDoc._id;
    }

    if (resolvedCategoryId == null) {
      const existingItem = await MenuItem.findOne({ id: numericId }).select("category").lean();
      if (!existingItem) {
        return res.status(404).json({ success: false, error: "Menu item not found" });
      }
      resolvedCategoryId = existingItem.category;
    }

    if ("variantGroups" in req.body) {
      console.log("[menu/update] payload", {
        itemId: numericId,
        categoryId: resolvedCategoryId ? String(resolvedCategoryId) : null,
        variantGroupRefs: normalizeVariantGroupRefs(req.body.variantGroups),
      });

      const {
        validGroupRefs,
        invalidGroups,
      } = await validateVariantGroupsForCategory({
        categoryId: resolvedCategoryId,
        variantGroups: req.body.variantGroups,
        context: `update:${numericId}`,
      });

      if (invalidGroups.length > 0) {
        return res.status(400).json({
          success: false,
          error: "One or more variant groups are invalid for the selected category.",
          invalidVariantGroups: serializeInvalidVariantGroups(invalidGroups),
        });
      }

      updateData.variantGroups = normalizeVariantGroupRefs(validGroupRefs);
    }

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

    // Best-effort GCS cleanup — never blocks the response
    await deleteGCSImage(deletedItem.image);

    console.log(`🗑 Deleted menu item: ${deletedItem.name}`);
    res.status(200).json({ success: true, message: "Menu item deleted successfully" });
  } catch (error) {
    console.error(`❌ Failed to delete menu item ${req.params.id}:`, error.message);
    res.status(500).json({ success: false, error: "Failed to delete menu item" });
  }
}
