import multer from "multer";
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
import path from "path";

/*
  Google Cloud Storage image upload middleware
  Public URL format after upload:
  https://storage.googleapis.com/<bucket>/<filename>
*/

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const storage = new Storage({ credentials });
const bucket  = storage.bucket(process.env.GCS_BUCKET_NAME);

// ── multer: buffer in memory, never write to disk ─────────────────────────────

function imageFilter(_req, file, cb) {
  const allowed = /^image\/(jpeg|png|webp|gif|avif)$/;
  if (allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (jpeg, png, webp, gif, avif)"), false);
  }
}

const multerInstance = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
}).single("image");

/*
  uploadImage
 
  Drop-in replacement for the previous local disk middleware.
  After this runs, req.file.path holds the public GCS URL —
  menu.controller.js reads req.file.path identically to before.
 
  Usage in menu.routes.js (unchanged):
    router.post("/:id/image", protect, authorize("admin"), uploadImage, uploadMenuItemImage)
 */
export function createImageUploadMiddleware(prefix = "menu") {
  return function uploadImageForPrefix(req, res, next) {
    multerInstance(req, res, async (err) => {
      if (err) return next(err);
      if (!req.file) return next(); // controller returns 400 "No image file provided"

      try {
        const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
        const filename = `${prefix}/${uuidv4()}${ext}`;
        const blob = bucket.file(filename);

        await blob.save(req.file.buffer, {
          contentType: req.file.mimetype,
          metadata: {
            cacheControl: "public, max-age=31536000",
          },
        });

        // Public URL — works immediately because allUsers has Storage Object Viewer
        const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${filename}`;
        req.file.path = publicUrl;

        next();
      } catch (uploadErr) {
        console.error("GCS upload failed:", uploadErr.message);
        next(new Error("Image upload to Google Cloud Storage failed: " + uploadErr.message));
      }
    });
  };
}

export const uploadImage = createImageUploadMiddleware("menu");
export const uploadCategoryImage = createImageUploadMiddleware("categories");

/*
  deleteGCSImage
 
  Deletes a blob from GCS by its public URL.
  Called by menu.controller.js when a menu item is deleted or its image replaced.
 
  Silently swallows errors — a failed cloud delete must never block a DB operation.
 
  @param {string} imageUrl - Full GCS public URL stored in MenuItem.image
*/
export async function deleteGCSImage(imageUrl) {
  if (!imageUrl) return;

  try {
    if (!/^https?:\/\//i.test(imageUrl)) return;

    // URL format: https://storage.googleapis.com/<bucket>/<filename>
    const url      = new URL(imageUrl);
    if (url.hostname !== "storage.googleapis.com") return;
    // pathname: /<bucket>/menu/<uuid>.jpg
    const segments = url.pathname.split("/").filter(Boolean);
    // segments[0] = bucket name, rest = object path
    const objectPath = segments.slice(1).join("/");

    if (!objectPath) return;

    await bucket.file(objectPath).delete({ ignoreNotFound: true });
    console.log(`🗑 Deleted GCS object: ${objectPath}`);
  } catch (err) {
    console.warn(`Could not delete GCS image "${imageUrl}":`, err.message);
  }
}
