import { VariantGroup } from "../models/VariantGroup.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function toSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

// ─── GET /variant-groups ──────────────────────────────────────────────────────

export async function getVariantGroups(req, res) {
  try {
    const groups = await VariantGroup.find({}).sort({ adminName: 1 }).lean();
    res.status(200).json({ success: true, groups });
  } catch (error) {
    console.error("Failed to fetch variant groups:", error.message);
    res.status(500).json({ success: false, error: "Failed to load variant groups." });
  }
}

// ─── POST /variant-groups ─────────────────────────────────────────────────────

export async function createVariantGroup(req, res) {
  try {
    const { adminName, customerLabel = "", isRequired, maxSelections, options = [] } = req.body;

    if (!adminName || !adminName.trim()) {
      return res.status(400).json({ success: false, error: "adminName is required." });
    }

    const groupId = toSlug(adminName);

    const collision = await VariantGroup.findOne({ groupId }).lean();
    if (collision) {
      return res.status(409).json({ success: false, error: "A group with that name already exists" });
    }

    const parsedOptions = options.map((opt, i) => ({
      name: opt.name,
      additionalPrice: opt.additionalPrice ?? 0,
      isActive: opt.isActive !== false,
      order: opt.order ?? i + 1,
    }));

    const group = new VariantGroup({
      groupId,
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
    const { adminName, customerLabel, isRequired, maxSelections, options } = req.body;

    const existing = await VariantGroup.findOne({ groupId }).lean();
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
      }));
    }

    const updated = await VariantGroup.findOneAndUpdate(
      { groupId },
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

export async function deleteVariantGroup(req, res) {
  try {
    const { groupId } = req.params;

    const deleted = await VariantGroup.findOneAndDelete({ groupId });
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Variant group not found." });
    }

    res.status(200).json({ success: true, message: "Variant group deleted successfully." });
  } catch (error) {
    console.error("Failed to delete variant group:", error.message);
    res.status(500).json({ success: false, error: "Failed to delete variant group." });
  }
}
