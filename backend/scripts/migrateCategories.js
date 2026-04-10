/**
 * migrateCategories.js
 *
 * One-time migration: promotes MenuItem.category (free-text String) to a full
 * Category model with ObjectId references, and assigns categoryId to every
 * existing VariantGroup document.
 *
 * IDEMPOTENT — safe to run multiple times. Already-migrated documents are
 * skipped, not re-processed.
 *
 * Usage (from backend/):
 *   npm run migrate:categories
 *
 * Or directly:
 *   node scripts/migrateCategories.js
 */

import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import { Category } from "../src/models/Category.js";
import { VariantGroup } from "../src/models/VariantGroup.js";
import { MenuItem } from "../src/models/MenuItem.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSlug(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Prefix-to-category-name mapping.
// Key: a groupId prefix (matched with groupId.startsWith(prefix))
// Value: the exact category name string currently stored on MenuItems
//
// Order matters — more-specific prefixes must come before broader ones.
// "matcha-" is explicitly Coffee because Matcha Latte lives in that category.
const GROUP_PREFIX_MAP = [
  { prefix: "yogurt-",   category: "Yogurts"          },
  { prefix: "coffee-",   category: "Coffee"            },
  { prefix: "mixed-",    category: "Mixed Beverages"   },
  { prefix: "matcha-",   category: "Coffee"            }, // Matcha Latte → Coffee
  { prefix: "tea-",      category: "Tea"               },
  { prefix: "pastry-",   category: "Pastries"          },
  { prefix: "sandwich-", category: "Sandwiches"        },
  { prefix: "water-",    category: "Soft Drinks"       },
];

function inferCategoryForGroup(groupId) {
  for (const { prefix, category } of GROUP_PREFIX_MAP) {
    if (groupId.startsWith(prefix)) return category;
  }
  return null; // could not confidently map — caller flags it
}

// ---------------------------------------------------------------------------
// Counters logged at the end
// ---------------------------------------------------------------------------
const summary = {
  categoriesCreated: 0,
  categoriesSkipped: 0,
  variantGroupsMapped: 0,
  variantGroupsAlreadyMapped: 0,
  variantGroupsFlagged: [],  // groupIds that could not be mapped
  menuItemsUpdated: 0,
  menuItemsSkipped: 0,       // already have ObjectId category
  menuItemsFlagged: [],      // category string not found in Category collection
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function migrate() {
  await connectDB();
  console.log("\n=== migrateCategories — starting ===\n");

  // -------------------------------------------------------------------------
  // 1. Collect distinct category strings from MenuItem
  // -------------------------------------------------------------------------
  console.log("── Step 1: Collecting distinct category strings from MenuItem ──");
  const rawCategories = await MenuItem.distinct("category");

  // Separate string values from ObjectId values (idempotency: some items may
  // already be migrated on a second run)
  const stringCategories = rawCategories.filter(
    (c) => typeof c === "string" && c.trim().length > 0,
  );
  console.log(`  Found ${stringCategories.length} distinct string category values:`);
  stringCategories.forEach((c) => console.log(`    • "${c}"`));

  // -------------------------------------------------------------------------
  // 2. Create Category documents for each unique string (if not already exist)
  // -------------------------------------------------------------------------
  console.log("\n── Step 2: Creating Category documents ──");
  const categoryNameToDoc = new Map(); // name (lowercase) → Category document

  // Sort alphabetically so the `order` field is predictable and consistent
  const sortedNames = [...stringCategories].sort((a, b) =>
    a.localeCompare(b),
  );

  for (let i = 0; i < sortedNames.length; i++) {
    const name = sortedNames[i];
    const slug = toSlug(name);

    const existing = await Category.findOne({
      $or: [{ slug }, { name: { $regex: new RegExp(`^${name}$`, "i") } }],
    });

    if (existing) {
      console.log(`  [SKIP]    "${name}" → Category already exists (_id: ${existing._id})`);
      categoryNameToDoc.set(name.toLowerCase(), existing);
      summary.categoriesSkipped++;
    } else {
      const created = await Category.create({
        name,
        slug,
        isActive: true,
        order: i,
        subcategories: [],
      });
      console.log(`  [CREATED] "${name}" → _id: ${created._id}, slug: "${slug}", order: ${i}`);
      categoryNameToDoc.set(name.toLowerCase(), created);
      summary.categoriesCreated++;
    }
  }

  // -------------------------------------------------------------------------
  // 3. Assign categoryId to VariantGroup documents
  // -------------------------------------------------------------------------
  console.log("\n── Step 3: Assigning categoryId to VariantGroup documents ──");
  const allGroups = await VariantGroup.find({});
  console.log(`  Found ${allGroups.length} VariantGroup documents`);

  for (const group of allGroups) {
    if (group.categoryId) {
      console.log(`  [SKIP]    "${group.groupId}" → categoryId already set`);
      summary.variantGroupsAlreadyMapped++;
      continue;
    }

    if (group.ctagId) {
      await VariantGroup.updateOne(
        { _id: group._id },
        { $set: { categoryId: group.ctagId } },
      );
      console.log(`  [MAPPED]  "${group.groupId}" → copied legacy ctagId into categoryId (${group.ctagId})`);
      summary.variantGroupsMapped++;
      continue;
    }

    const inferredName = inferCategoryForGroup(group.groupId);

    if (!inferredName) {
      console.warn(`  [FLAG]    "${group.groupId}" → could not infer category from prefix — manual review required`);
      summary.variantGroupsFlagged.push(group.groupId);
      continue;
    }

    const categoryDoc = categoryNameToDoc.get(inferredName.toLowerCase());
    if (!categoryDoc) {
      console.warn(`  [FLAG]    "${group.groupId}" → inferred category "${inferredName}" but no Category doc found — manual review required`);
      summary.variantGroupsFlagged.push(group.groupId);
      continue;
    }

    await VariantGroup.updateOne(
      { _id: group._id },
      { $set: { categoryId: categoryDoc._id } },
    );
    console.log(`  [MAPPED]  "${group.groupId}" → "${inferredName}" (${categoryDoc._id})`);
    summary.variantGroupsMapped++;
  }

  // -------------------------------------------------------------------------
  // 4. Update MenuItem.category from String → Category ObjectId
  // -------------------------------------------------------------------------
  console.log("\n── Step 4: Flipping MenuItem.category String → ObjectId ──");

  // Fetch all items where category is still a string (not yet an ObjectId)
  const allItems = await MenuItem.find({});
  let stringItems = allItems.filter((item) => typeof item.category === "string");
  console.log(`  ${stringItems.length} items still have a string category value`);

  for (const item of stringItems) {
    const catName = item.category.trim();
    const categoryDoc = categoryNameToDoc.get(catName.toLowerCase());

    if (!categoryDoc) {
      console.warn(
        `  [FLAG]    item id=${item.id} ("${item.name}") — category string "${catName}" has no matching Category doc — SKIPPING`,
      );
      summary.menuItemsFlagged.push({ id: item.id, name: item.name, category: catName });
      continue;
    }

    await MenuItem.updateOne(
      { _id: item._id },
      { $set: { category: categoryDoc._id } },
    );
    console.log(`  [UPDATED] item id=${item.id} ("${item.name}") — "${catName}" → ${categoryDoc._id}`);
    summary.menuItemsUpdated++;
  }

  const alreadyMigrated = allItems.length - stringItems.length;
  if (alreadyMigrated > 0) {
    console.log(`  [SKIP]    ${alreadyMigrated} items already have an ObjectId category`);
    summary.menuItemsSkipped += alreadyMigrated;
  }

  // -------------------------------------------------------------------------
  // 5. Summary
  // -------------------------------------------------------------------------
  console.log("\n=== MIGRATION SUMMARY ===");
  console.log(`  Categories created:              ${summary.categoriesCreated}`);
  console.log(`  Categories already existed:      ${summary.categoriesSkipped}`);
  console.log(`  Variant groups mapped:           ${summary.variantGroupsMapped}`);
  console.log(`  Variant groups already mapped:   ${summary.variantGroupsAlreadyMapped}`);
  console.log(`  Variant groups FLAGGED:          ${summary.variantGroupsFlagged.length}`);
  if (summary.variantGroupsFlagged.length > 0) {
    summary.variantGroupsFlagged.forEach((id) =>
      console.log(`    ⚠  ${id}`),
    );
  }
  console.log(`  Menu items updated:              ${summary.menuItemsUpdated}`);
  console.log(`  Menu items already migrated:     ${summary.menuItemsSkipped}`);
  console.log(`  Menu items FLAGGED:              ${summary.menuItemsFlagged.length}`);
  if (summary.menuItemsFlagged.length > 0) {
    summary.menuItemsFlagged.forEach(({ id, name, category }) =>
      console.log(`    ⚠  id=${id} "${name}" — unknown category "${category}"`),
    );
  }

  const hasIssues =
    summary.variantGroupsFlagged.length > 0 ||
    summary.menuItemsFlagged.length > 0;

  if (hasIssues) {
    console.log("\n⚠  Migration completed with issues — see flagged items above.");
    console.log("   Resolve flagged documents manually before going live.");
  } else {
    console.log("\n✅ Migration completed cleanly — no flagged items.");
  }

  await mongoose.disconnect();
  process.exit(hasIssues ? 1 : 0);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
