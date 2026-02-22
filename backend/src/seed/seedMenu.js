import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { connectDB } from "../config/db.js";
import { MenuItem } from "../models/MenuItem.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seed() {
  await connectDB();

  const filePath = path.join(__dirname, "menu.seed.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const items = JSON.parse(raw);

  const itemsWithIds = items.map((item, index) => ({
    ...item,
    id: item.id || index + 1
  }));

  await MenuItem.deleteMany({});
  await MenuItem.insertMany(itemsWithIds);

  console.log(`✅ Seeded menu items: ${itemsWithIds.length}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err.message);
  process.exit(1);
});
