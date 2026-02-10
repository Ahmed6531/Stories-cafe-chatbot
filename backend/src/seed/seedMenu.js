import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { connectDB } from "../config/db.js";
import { MenuItem } from "../models/MenuItem.js";
import { VariantGroup } from "../models/VariantGroup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to convert old data to new schema
function convertToNewSchema(oldItem) {
  // If it's already in new format, return as-is
  if (oldItem.slug && oldItem.name && oldItem.basePrice !== undefined) {
    return oldItem;
  }

  // Otherwise convert from old format
  return {
    slug: oldItem.slug || oldItem.name.toLowerCase().replace(/\s+/g, "-"),
    name: oldItem.name || "Unknown Item",
    description: oldItem.description || "No description available",
    basePrice: oldItem.basePrice || oldItem.price || 0,
    category: oldItem.category || "Uncategorized",
    image: oldItem.image || "/images/default.png",
    isAvailable: oldItem.isAvailable !== false,
    isFeatured: oldItem.isFeatured || false,
    variantGroups: oldItem.variantGroups || [],
  };
}

async function seed() {
  await connectDB();

  // 1. Seed variant groups
  const variantTemplatesPath = path.join(__dirname, "variant-templates.json");
  if (fs.existsSync(variantTemplatesPath)) {
    const templatesRaw = fs.readFileSync(variantTemplatesPath, "utf-8");
    const templates = JSON.parse(templatesRaw);

    const variantGroupsArray = Object.entries(templates.variantGroups).map(
      ([groupId, group]) => ({
        groupId,
        ...group,
      }),
    );

    await VariantGroup.deleteMany({});
    await VariantGroup.insertMany(variantGroupsArray);
    console.log(`✅ Seeded variant groups: ${variantGroupsArray.length}`);
  }

  // 2. Seed menu items
  const menuItemsPath = path.join(__dirname, "menu.seed.json");
  const raw = fs.readFileSync(menuItemsPath, "utf-8");
  const items = JSON.parse(raw);

  // Convert to new schema
  const convertedItems = items.map(convertToNewSchema);

  await MenuItem.deleteMany({});
  await MenuItem.insertMany(convertedItems);

  console.log(`✅ Seeded menu items: ${convertedItems.length}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err.message);
  process.exit(1);
});
