import { VariantGroup } from "../models/VariantGroup.js";
import { Category } from "../models/Category.js";
import { MenuItem } from "../models/MenuItem.js";
import { generateVariantGroupRefId } from "../utils/variantGroupRefs.js";

function buildScopedGroupFilter(groupRef, categoryId) {
  const filter = { groupId: groupRef };
  return categoryId ? { $and: [filter, { categoryId }] } : filter;
}

function getGroupRefs(group) {
  const value = group?.groupId;
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

export async function createVariantGroup(req, res) {
  try {
    const {
      adminName,
      customerLabel = "",
      isRequired,
      maxSelections,
      options = [],
    } = req.body;

    const categoryId = req.params.categoryId;

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

export async function updateVariantGroup(req, res) {
  try {
    const { groupId } = req.params;
    const scopedCategoryId = req.params.categoryId || null;
    const { adminName, customerLabel, isRequired, maxSelections, options, isActive } = req.body;

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

    if (isActive !== undefined) {
      updateData.isActive = isActive === true || isActive === "true";
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

export async function deleteVariantGroup(req, res) {
  try {
    const { groupId } = req.params;
    const scopedCategoryId = req.params.categoryId || null;
    const hardDelete = req.query.hard === "true";
    const cascade = req.query.cascade === "true";

    const existing = await VariantGroup.findOne(buildScopedGroupFilter(groupId, scopedCategoryId)).lean();
    if (!existing) {
      return res.status(404).json({ success: false, error: "Variant group not found." });
    }

    if (!hardDelete) {
      const updated = await VariantGroup.findOneAndUpdate(
        buildScopedGroupFilter(groupId, scopedCategoryId),
        { $set: { isActive: false } },
        { new: true },
      );

      return res.status(200).json({ success: true, message: "Variant group deactivated.", group: updated });
    }

    const refs = getGroupRefs(existing);
    const attachedMenuItemCount = await MenuItem.countDocuments({
      variantGroups: { $in: refs },
    });

    if (attachedMenuItemCount > 0 && !cascade) {
      return res.status(409).json({
        success: false,
        error: "Variant group is still attached to menu items. Confirm cascade delete to remove it from those items.",
        requiresCascade: true,
        usage: {
          menuItems: attachedMenuItemCount,
        },
      });
    }

    if (refs.length > 0) {
      await MenuItem.updateMany(
        { variantGroups: { $in: refs } },
        { $pull: { variantGroups: { $in: refs } } },
      );
    }

    await VariantGroup.deleteOne({ _id: existing._id });

    res.status(200).json({
      success: true,
      message: attachedMenuItemCount > 0
        ? "Variant group deleted and removed from attached menu items."
        : "Variant group deleted permanently.",
      deletedGroupId: String(existing._id),
      deletedRefs: refs,
      detachedFromMenuItems: attachedMenuItemCount,
    });
  } catch (error) {
    console.error("Failed to delete variant group:", error.message);
    res.status(500).json({ success: false, error: "Failed to delete variant group." });
  }
}
