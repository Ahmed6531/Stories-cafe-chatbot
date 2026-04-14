/**
 * migrate-category-images-to-gcs.js
 *
 * One-time migration script.
 * Reads each category from MongoDB, finds its corresponding image in
 * frontend/public/images/, uploads it to Google Cloud Storage under the
 * categories/ prefix, and patches Category.image in MongoDB with the GCS URL.
 *
 * Run from the project ROOT:
 *
 *   node migrate-category-images-to-gcs.js
 *
 * Prerequisites:
 *   - GCS bucket already created and public (allUsers Storage Object Viewer)
 *   - GOOGLE_CREDENTIALS_JSON, GCS_BUCKET_NAME, and MONGODB_URI set in backend/.env
 *
 * Safe to re-run:
 *   - Categories already pointing to a GCS URL are skipped
 *   - Categories without a mapped local file are skipped
 *   - Nothing is deleted from frontend/public/images/
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// -- Load env from backend/.env -------------------------------------------------
const dotenv = require("./backend/node_modules/dotenv");
dotenv.config({ path: path.join(__dirname, "backend", ".env") });

const { Storage } = require("./backend/node_modules/@google-cloud/storage");
const mongoose = require("./backend/node_modules/mongoose");

// -- Config ---------------------------------------------------------------------
const IMAGES_DIR = path.join(__dirname, "frontend", "public", "images");
const BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const CREDS_JSON = process.env.GOOGLE_CREDENTIALS_JSON;

if (!BUCKET_NAME) {
  console.error("GCS_BUCKET_NAME is not set in backend/.env");
  process.exit(1);
}
if (!CREDS_JSON) {
  console.error("GOOGLE_CREDENTIALS_JSON is not set in backend/.env");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set in backend/.env");
  process.exit(1);
}

// Explicit category slug -> candidate local filenames.
// These categories do not currently store /images/... paths in MongoDB, so the
// migration must be deterministic from known slugs.
const CATEGORY_IMAGE_MAP = {
  coffee: ["coffee.png"],
  "mixed-beverages": ["mixedbev.png", "mixed-beverages.png"],
  pastries: ["pastries.png"],
  salad: ["salad.png", "salad.jpg"],
  sandwiches: ["sandwiches.png", "sandwich.png"],
  "soft-drinks": ["soft-drinks.png", "softdrinks.png"],
  tea: ["tea.png"],
  yogurts: ["yogurt.png", "yogurts.png"],
};

// -- GCS client -----------------------------------------------------------------
const credentials = JSON.parse(CREDS_JSON);
const storage = new Storage({ credentials });
const bucket = storage.bucket(BUCKET_NAME);

// -- Mongoose -------------------------------------------------------------------
const categorySchema = new mongoose.Schema(
  { name: String, slug: String, image: String },
  { strict: false },
);
const Category = mongoose.models.Category || mongoose.model("Category", categorySchema, "categories");

// -- Helpers --------------------------------------------------------------------

function getMimeType(filename) {
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "avif") return "image/avif";
  if (ext === "gif") return "image/gif";
  return `image/${ext}`;
}

async function findCategoryImageFile(slug) {
  const candidates = CATEGORY_IMAGE_MAP[slug] || [];

  for (const filename of candidates) {
    const filepath = path.join(IMAGES_DIR, filename);
    try {
      const buffer = await fs.readFile(filepath);
      return {
        buffer,
        filename,
        mimetype: getMimeType(filename),
      };
    } catch {
      // Try next mapped filename.
    }
  }

  return null;
}

async function uploadToGCS({ slug, filename, buffer, mimetype }) {
  const ext = path.extname(filename).toLowerCase() || ".png";
  const safeSlug = String(slug)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const gcsPath = `categories/${safeSlug}-${Date.now()}${ext}`;
  const blob = bucket.file(gcsPath);

  await blob.save(buffer, {
    contentType: mimetype,
    metadata: {
      cacheControl: "public, max-age=31536000",
    },
  });

  return `https://storage.googleapis.com/${BUCKET_NAME}/${gcsPath}`;
}

// -- Main -----------------------------------------------------------------------

async function main() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log("Connected\n");

  const categories = await Category.find({}).sort({ order: 1, name: 1 }).lean();
  console.log(`Found ${categories.length} categories\n`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  for (const category of categories) {
    const label = category.name || category.slug || String(category._id);
    const slug = String(category.slug || "").trim();

    if (category.image && category.image.includes("storage.googleapis.com")) {
      console.log(`Skip  "${label}" - already on GCS`);
      skipped += 1;
      continue;
    }

    if (!slug) {
      console.log(`Skip  "${label}" - no slug`);
      skipped += 1;
      continue;
    }

    const found = await findCategoryImageFile(slug);
    if (!found) {
      console.log(`Skip  "${label}" - no mapped local image for slug "${slug}"`);
      skipped += 1;
      continue;
    }

    try {
      const gcsUrl = await uploadToGCS({ slug, ...found });
      await Category.updateOne({ _id: category._id }, { $set: { image: gcsUrl } });
      console.log(`Done  "${label}" <- ${found.filename} -> ${gcsUrl}`);
      migrated += 1;
    } catch (error) {
      console.log(`Fail  "${label}" - upload error: ${error.message}`);
      failed += 1;
      failures.push({ name: label, slug, filename: found.filename, error: error.message });
    }
  }

  console.log("\n----------------------------------------");
  console.log(`Migrated : ${migrated}`);
  console.log(`Skipped  : ${skipped}`);
  console.log(`Failed   : ${failed}`);
  console.log("----------------------------------------\n");

  if (failures.length > 0) {
    console.log("Categories that could not be migrated:");
    failures.forEach((entry) => {
      console.log(`  - "${entry.name}" (${entry.slug}) -> ${entry.filename} (${entry.error})`);
    });
    console.log("");
  } else {
    console.log("All mapped category images migrated successfully.\n");
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Fatal error:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // noop
  }
  process.exit(1);
});
