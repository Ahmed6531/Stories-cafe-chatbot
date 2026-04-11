import { VariantGroup } from "../models/VariantGroup.js";
import { Category } from "../models/Category.js";
import { generateVariantGroupRefId } from "../utils/variantGroupRefs.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildScopedGroupFilter(groupRef, categoryId) {
  const refFilter = {
    $or: [
      { groupId: groupRef },
      { refId: groupRef },
    ],
  };

  if (!categoryId) {
    return refFilter;
  }

  return {
    $and: [
      refFilter,
      {
        $or: [
          { categoryId },
          { ctagId: categoryId },
        ],
      },
    ],
  };
}

// ─── GET /variant-groups ──────────────────────────────────────────────────────
// Global flat list — kept for backward compat with the legacy admin page.
// Prefer GET /categories/:categoryId/variant-groups for scoped access.

export async function getVariantGroups(req, res) {
  try {
    const groups = await VariantGroup.find({ isActive: { $ne: false } })
      .sort({ adminName: 1 })
      .lean();
    res.status(200).json({ success: true, groups });
  } catch (error) {
    console.error("Failed to fetch variant groups:", error.message);
    res.status(500).json({ success: false, error: "Failed to load variant groups." });
  }
}

// ─── POST /variant-groups  (or nested: POST /categories/:categoryId/variant-groups) ──
// categoryId is read from req.params first (nested route), then req.body (flat route).

export async function createVariantGroup(req, res) {
  try {
    const {
      adminName,
      customerLabel = "",
      isRequired,
      maxSelections,
      options = [],
    } = req.body;

    // Resolve categoryId: nested route provides it via params, flat route via body
    const categoryId = req.params.categoryId || req.body.categoryId;

    if (!adminName || !adminName.trim()) {
      return res.status(400).json({ success: false, error: "adminName is required." });
    }
    if (!categoryId) {
      return res.status(400).json({ success: false, error: "categoryId is required." });
    }

    const categoryDoc = await Category.findById(categoryId).lean();
    if (!categoryDoc) {
      return res.status(400).json({ success: false, error: "Category not found." });
    }

    const refId = generateVariantGroupRefId();
    const groupId = refId;

    const collision = await VariantGroup.findOne({
      $or: [{ groupId }, { refId }],
    }).lean();
    if (collision) {
      return res.status(409).json({ success: false, error: "A group with that reference already exists." });
    }

    const parsedOptions = options.map((opt, i) => ({
      name: opt.name,
      additionalPrice: opt.additionalPrice ?? 0,
      isActive: opt.isActive !== false,
      order: opt.order ?? i + 1,
      suboptionLabel: typeof opt.suboptionLabel === "string" ? opt.suboptionLabel.trim() : "",
      suboptions: opt.suboptions || [],
    }));

    const group = new VariantGroup({
      refId,
      groupId,
      categoryId: categoryDoc._id,
      ctagId: categoryDoc._id,
      adminName: adminName.trim(),
      customerLabel: customerLabel.trim(),
      name: customerLabel.trim() || adminName.trim(),
      isRequired: isRequired === true || isRequired === "true",
      maxSelections: maxSelections != null ? Number(maxSelections) : undefined,
      options: parsedOptions,
    });

    await group.save();
    res.status(201).json({ success: true, group });
  } catch (error) {
    console.error("Failed to create variant group:", error.message);
    res.status(400).json({ success: false, error: error.message || "Failed to create variant group." });
  }
}

// ─── PATCH /variant-groups/:groupId ──────────────────────────────────────────

export async function updateVariantGroup(req, res) {
  try {
    const { groupId } = req.params;
    const scopedCategoryId = req.params.categoryId || null;
    const { adminName, customerLabel, isRequired, maxSelections, options } = req.body;

    const existing = await VariantGroup.findOne(buildScopedGroupFilter(groupId, scopedCategoryId)).lean();
    if (!existing) {
      return res.status(404).json({ success: false, error: "Variant group not found." });
    }

    const updateData = {};

    if (adminName !== undefined) {
      updateData.adminName = adminName.trim();
    }

    if (customerLabel !== undefined) {
      updateData.customerLabel = customerLabel.trim();
    }

    // Keep name in sync with customerLabel || adminName
    const resolvedAdminName = updateData.adminName ?? existing.adminName;
    const resolvedCustomerLabel = updateData.customerLabel !== undefined
      ? updateData.customerLabel
      : existing.customerLabel;
    updateData.name = resolvedCustomerLabel || resolvedAdminName;

    if (isRequired !== undefined) {
      updateData.isRequired = isRequired === true || isRequired === "true";
    }

    if (maxSelections !== undefined) {
      updateData.maxSelections = maxSelections === null || maxSelections === "" ? undefined : Number(maxSelections);
    }

    if (options !== undefined) {
      updateData.options = options.map((opt, i) => ({
        name: opt.name,
        additionalPrice: opt.additionalPrice ?? 0,
        isActive: opt.isActive !== false,
        order: opt.order ?? i + 1,
        suboptionLabel: typeof opt.suboptionLabel === "string" ? opt.suboptionLabel.trim() : "",
        suboptions: opt.suboptions || [],
      }));
    }

    const updated = await VariantGroup.findOneAndUpdate(
      buildScopedGroupFilter(groupId, scopedCategoryId),
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, group: updated });
  } catch (error) {
    console.error("Failed to update variant group:", error.message);
    res.status(400).json({ success: false, error: error.message || "Failed to update variant group." });
  }
}

// ─── DELETE /variant-groups/:groupId ─────────────────────────────────────────
// Soft delete — sets isActive: false. Never hard-deletes VariantGroup docs.

export async function deleteVariantGroup(req, res) {
  try {
    const { groupId } = req.params;
    const scopedCategoryId = req.params.categoryId || null;

    const updated = await VariantGroup.findOneAndUpdate(
      buildScopedGroupFilter(groupId, scopedCategoryId),
      { $set: { isActive: false } },
      { new: true },
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: "Variant group not found." });
    }

    res.status(200).json({ success: true, message: "Variant group deactivated." });
  } catch (error) {
    console.error("Failed to deactivate variant group:", error.message);
    res.status(500).json({ success: false, error: "Failed to deactivate variant group." });
  }
}
