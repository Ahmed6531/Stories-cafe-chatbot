import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { connectDB } from "../config/db.js";
import { Category } from "../models/Category.js";
import { MenuItem } from "../models/MenuItem.js";
import { VariantGroup } from "../models/VariantGroup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Maps variant group ID prefixes → category name.
// Must mirror the same table in migrateCategories.js.
// Order matters — more-specific prefixes first.
const GROUP_PREFIX_MAP = [
  { prefix: "yogurt-",   category: "Yogurts"    },
  { prefix: "coffee-",   category: "Coffee"     },
  { prefix: "mixed-",    category: "Mixed Beverages" },
  { prefix: "matcha-",   category: "Coffee"     }, // Matcha Latte lives in Coffee
  { prefix: "tea-",      category: "Tea"        },
  { prefix: "pastry-",   category: "Pastries"   },
  { prefix: "sandwich-", category: "Sandwiches" },
  { prefix: "water-",    category: "Soft Drinks"},
];

function inferCategoryForGroup(groupId) {
  for (const { prefix, category } of GROUP_PREFIX_MAP) {
    if (groupId.startsWith(prefix)) return category;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed() {
  await connectDB();

  // ── 1. Wipe existing data ──────────────────────────────────────────────────
  await Category.deleteMany({});
  await VariantGroup.deleteMany({});
  await MenuItem.deleteMany({});
  console.log("🗑  Cleared Category, VariantGroup, MenuItem collections");

  // ── 2. Derive and seed Category documents ─────────────────────────────────
  const menuItemsPath = path.join(__dirname, "menu.seed.json");
  const menuItems = JSON.parse(fs.readFileSync(menuItemsPath, "utf-8"));

  const distinctNames = [
    ...new Set(menuItems.map((i) => i.category).filter(Boolean)),
  ].sort();

  const categoryDocs = [];
  for (let i = 0; i < distinctNames.length; i++) {
    const name = distinctNames[i];
    const doc = await Category.create({
      name,
      slug: toSlug(name),
      image: "",
      isActive: true,
      order: i,
      subcategories: [],
    });
    categoryDocs.push(doc);
  }

  // name (lowercase) → ObjectId
  const categoryByName = new Map(
    categoryDocs.map((d) => [d.name.toLowerCase(), d._id]),
  );

  console.log(`✅ Seeded ${categoryDocs.length} categories:`);
  categoryDocs.forEach((d) =>
    console.log(`   • "${d.name}" (${d._id}, slug: "${d.slug}")`),
  );

  // ── 3. Seed VariantGroup documents (with categoryId) ──────────────────────
  const variantTemplatesPath = path.join(__dirname, "variant-templates.json");
  const templates = JSON.parse(fs.readFileSync(variantTemplatesPath, "utf-8"));

  const variantGroupsArray = Object.entries(templates.variantGroups).map(
    ([groupId, group]) => {
      const inferredCategoryName = inferCategoryForGroup(groupId);
      const categoryId = inferredCategoryName
        ? categoryByName.get(inferredCategoryName.toLowerCase()) ?? null
        : null;

      if (!categoryId) {
        console.warn(
          `  ⚠  variant group "${groupId}" — could not map to a category. categoryId will be null.`,
        );
      }

      return {
        ...group,
        groupId,
        adminName: group.adminName || group.name,
        customerLabel: group.customerLabel || "",
        name: group.name,
        categoryId,
        ctagId: categoryId,
      };
    },
  );

  await VariantGroup.insertMany(variantGroupsArray);
  const mapped = variantGroupsArray.filter((g) => g.categoryId).length;
  const unmapped = variantGroupsArray.length - mapped;
  console.log(
    `✅ Seeded ${variantGroupsArray.length} variant groups (${mapped} with categoryId, ${unmapped} without)`,
  );

  // ── 4. Seed MenuItem documents (category as ObjectId ref) ─────────────────
  const convertedItems = menuItems.map((item, idx) => {
    const catId = item.category
      ? categoryByName.get(item.category.toLowerCase())
      : null;

    if (!catId) {
      console.warn(
        `  ⚠  item id=${item.id || idx + 1} "${item.name}" — unknown category "${item.category}". category will be null.`,
      );
    }

    return {
      id: item.id || idx + 1,
      slug: item.slug || toSlug(item.name),
      name: item.name || "Unknown Item",
      description: item.description || "No description available",
      basePrice: item.basePrice || item.price || 0,
      category: catId || null,
      subcategory: item.subcategory || null,
      image: item.image || "",
      isAvailable: item.isAvailable !== false,
      isFeatured: item.isFeatured || false,
      variantGroups: item.variantGroups || [],
    };
  });

  await MenuItem.insertMany(convertedItems);
  console.log(`✅ Seeded ${convertedItems.length} menu items`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err.message);
  process.exit(1);
});
