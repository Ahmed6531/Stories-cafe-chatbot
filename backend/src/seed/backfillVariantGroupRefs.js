import { connectDB } from "../config/db.js";
import { MenuItem } from "../models/MenuItem.js";
import { VariantGroup } from "../models/VariantGroup.js";
import {
  generateVariantGroupRefId,
  normalizeVariantGroupRefs,
} from "../utils/variantGroupRefs.js";

async function backfillVariantGroupRefs() {
  await connectDB();

  const groups = await VariantGroup.find({})
    .select("_id refId groupId")
    .lean();

  let groupsUpdated = 0;
  for (const group of groups) {
    if (group.refId) {
      continue;
    }

    const refId = generateVariantGroupRefId();
    await VariantGroup.updateOne({ _id: group._id }, { $set: { refId } });
    group.refId = refId;
    groupsUpdated += 1;
  }

  const refreshedGroups = await VariantGroup.find({})
    .select("_id refId groupId")
    .lean();
  const refByLegacyGroupId = new Map(
    refreshedGroups
      .filter((group) => group.groupId && group.refId)
      .map((group) => [String(group.groupId), String(group.refId)]),
  );

  const menuItems = await MenuItem.find({})
    .select("_id variantGroups")
    .lean();

  let menuItemsUpdated = 0;
  for (const item of menuItems) {
    const existingRefs = Array.isArray(item.variantGroups) ? item.variantGroups : [];
    const rewrittenRefs = normalizeVariantGroupRefs(
      existingRefs.map((groupRef) => refByLegacyGroupId.get(String(groupRef)) || groupRef),
    );

    const unchanged =
      existingRefs.length === rewrittenRefs.length &&
      existingRefs.every((groupRef, index) => String(groupRef) === rewrittenRefs[index]);

    if (unchanged) {
      continue;
    }

    await MenuItem.updateOne({ _id: item._id }, { $set: { variantGroups: rewrittenRefs } });
    menuItemsUpdated += 1;
  }

  console.log("Variant-group ref backfill complete", {
    groupsUpdated,
    menuItemsUpdated,
  });
}

backfillVariantGroupRefs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Variant-group ref backfill failed:", error.message);
    process.exit(1);
  });
