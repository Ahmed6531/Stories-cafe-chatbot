import { Category } from "../models/Category.js";
import { VariantGroup } from "../models/VariantGroup.js";
import { MenuItem } from "../models/MenuItem.js";
import { deleteGCSImage } from "../middleware/upload.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function toSlug(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildVariantGroupCategoryFilter(categoryId) {
  return {
    $or: [
      { categoryId },
      { ctagId: categoryId },
    ],
  };
}

function getVariantGroupRefs(group) {
  return [group?.refId, group?.groupId]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());
}

// ─── GET /categories ──────────────────────────────────────────────────────────
// Public. Returns all active categories ordered by the `order` field.
// Used by CategoryRail and the menu page.

export async function getCategories(req, res) {
  try {
    const { includeInactive } = req.query;
    const filter = includeInactive === "true" ? {} : { isActive: true };
    const categories = await Category.find(filter)
      .sort({ order: 1, name: 1 })
      .lean();
    res.status(200).json({ success: true, categories });
  } catch (error) {
    console.error("Failed to fetch categories:", error.message);
    res.status(500).json({ success: false, error: "Failed to load categories." });
  }
}

// ─── GET /categories/:slug ────────────────────────────────────────────────────
// Public. Returns a single category by slug.

export async function getCategoryBySlug(req, res) {
  try {
    const { slug } = req.params;
    const category = await Category.findOne({ slug }).lean();
    if (!category) {
      return res.status(404).json({ success: false, error: "Category not found." });
    }
    res.status(200).json({ success: true, category });
  } catch (error) {
    console.error("Failed to fetch category:", error.message);
    res.status(500).json({ success: false, error: "Failed to load category." });
  }
}

// ─── POST /categories ─────────────────────────────────────────────────────────
// Admin only.

export async function createCategory(req, res) {
  try {
    const { name, image = "", isActive = true, order = 0, subcategories = [] } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "name is required." });
    }

    const slug = toSlug(name);
    const collision = await Category.findOne({ $or: [{ slug }, { name: name.trim() }] }).lean();
    if (collision) {
      return res.status(409).json({ success: false, error: "A category with that name already exists." });
    }

    const category = await Category.create({
      name: name.trim(),
      slug,
      image: image.trim(),
      isActive,
      order: Number(order) || 0,
      subcategories: subcategories.map((sub, i) => ({
        name: sub.name.trim(),
        slug: sub.slug?.trim() || toSlug(sub.name),
        order: sub.order ?? i,
      })),
    });

    res.status(201).json({ success: true, category });
  } catch (error) {
    console.error("Failed to create category:", error.message);
    res.status(400).json({ success: false, error: error.message || "Failed to create category." });
  }
}

// ─── PATCH /categories/:id ────────────────────────────────────────────────────
// Admin only. Allows partial updates. Regenerates slug only if name changes.

export async function updateCategory(req, res) {
  try {
    const { id } = req.params;
    const { name, image, isActive, order, subcategories } = req.body;

    const existing = await Category.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Category not found." });
    }

    const updateData = {};

    if (name !== undefined) {
      const trimmed = name.trim();
      const newSlug = toSlug(trimmed);
      // Check collision with other docs only
      const collision = await Category.findOne({
        _id: { $ne: id },
        $or: [{ slug: newSlug }, { name: trimmed }],
      }).lean();
      if (collision) {
        return res.status(409).json({ success: false, error: "A category with that name already exists." });
      }
      updateData.name = trimmed;
      updateData.slug = newSlug;
    }

    if (image !== undefined)      updateData.image = image.trim();
    if (isActive !== undefined)   updateData.isActive = Boolean(isActive);
    if (order !== undefined)      updateData.order = Number(order);

    if (subcategories !== undefined) {
      updateData.subcategories = subcategories.map((sub, i) => ({
        name: sub.name.trim(),
        slug: sub.slug?.trim() || toSlug(sub.name),
        order: sub.order ?? i,
      }));
    }

    const updated = await Category.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    );

    res.status(200).json({ success: true, category: updated });
  } catch (error) {
    console.error("Failed to update category:", error.message);
    res.status(400).json({ success: false, error: error.message || "Failed to update category." });
  }
}

// --- POST /categories/:id/image ------------------------------------------------
// Admin only. Mirrors menu image uploads, but stores files under categories/.

export async function uploadCategoryImage(req, res) {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image file provided" });
    }

    const existing = await Category.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ success: false, error: "Category not found." });
    }

    if (existing.image) {
      await deleteGCSImage(existing.image);
    }

    const imageUrl = req.file.path;
    const updated = await Category.findByIdAndUpdate(
      id,
      { $set: { image: imageUrl } },
      { new: true, runValidators: false },
    );

    res.status(200).json({
      success: true,
      message: "Category image uploaded successfully",
      imageUrl,
      category: updated,
    });
  } catch (error) {
    console.error(`Failed to upload image for category ${req.params.id}:`, error.message);
    res.status(500).json({ success: false, error: "Failed to upload category image." });
  }
}

// ─── DELETE /categories/:id ───────────────────────────────────────────────────
// Admin only. Permanently deletes a category, optionally cascading to related
// menu items and variant groups after explicit confirmation.

export async function deleteCategory(req, res) {
  try {
    const { id } = req.params;
    const cascade = req.query.cascade === "true";
    const existing = await Category.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ success: false, error: "Category not found." });
    }

    const [relatedItems, relatedGroups] = await Promise.all([
      MenuItem.find({ category: existing._id }).select("_id id image variantGroups").lean(),
      VariantGroup.find(buildVariantGroupCategoryFilter(existing._id))
        .select("_id refId groupId")
        .lean(),
    ]);

    const menuItemCount = relatedItems.length;
    const variantGroupCount = relatedGroups.length;

    if (menuItemCount > 0 || variantGroupCount > 0) {
      if (!cascade) {
        return res.status(409).json({
          success: false,
          error: "Category is still in use. Confirm cascade delete to remove its menu items and variant groups.",
          requiresCascade: true,
          usage: {
            menuItems: menuItemCount,
            variantGroups: variantGroupCount,
          },
        });
      }
    }

    const groupRefs = [...new Set(relatedGroups.flatMap(getVariantGroupRefs))];

    if (groupRefs.length > 0) {
      await MenuItem.updateMany(
        { variantGroups: { $in: groupRefs } },
        { $pull: { variantGroups: { $in: groupRefs } } },
      );
    }

    await Promise.allSettled(relatedItems.map((item) => deleteGCSImage(item.image)));
    await deleteGCSImage(existing.image);

    if (menuItemCount > 0) {
      await MenuItem.deleteMany({ category: existing._id });
    }
    if (variantGroupCount > 0) {
      await VariantGroup.deleteMany(buildVariantGroupCategoryFilter(existing._id));
    }
    await Category.deleteOne({ _id: existing._id });

    res.status(200).json({
      success: true,
      message: cascade && (menuItemCount > 0 || variantGroupCount > 0)
        ? "Category and its related data deleted permanently."
        : "Category deleted permanently.",
      deletedCategoryId: String(existing._id),
      deletedCounts: {
        menuItems: menuItemCount,
        variantGroups: variantGroupCount,
      },
    });
  } catch (error) {
    console.error("Failed to delete category:", error.message);
    res.status(500).json({ success: false, error: "Failed to delete category." });
  }
}

// ─── GET /categories/:categoryId/variant-groups ───────────────────────────────
// Public. Returns active variant groups for a specific category, ordered.

export async function getVariantGroupsByCategory(req, res) {
  try {
    const { categoryId } = req.params;
    const includeInactive = req.query.includeInactive === "true";
    const category = await Category.findById(categoryId).lean();
    if (!category) {
      return res.status(404).json({ success: false, error: "Category not found." });
    }

    const query = {
      ...buildVariantGroupCategoryFilter(category._id),
    };
    if (!includeInactive) {
      query.isActive = { $ne: false };
    }
    const groups = await VariantGroup.find(query)
      .sort({ order: 1, adminName: 1 })
      .lean();

    console.log("[variant-groups/by-category]", {
      categoryId: String(category._id),
      groupRefs: groups.map((group) => group.refId || group.groupId),
      categoryRefs: groups.map((group) => ({
        refId: group.refId || null,
        groupId: group.groupId,
        categoryId: group.categoryId ? String(group.categoryId) : null,
        ctagId: group.ctagId ? String(group.ctagId) : null,
      })),
    });

    res.status(200).json({ success: true, groups });
  } catch (error) {
    console.error("Failed to fetch variant groups for category:", error.message);
    res.status(500).json({ success: false, error: "Failed to load variant groups." });
  }
}
