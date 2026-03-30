import multer from "multer";
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
import path from "path";

/*
  Google Cloud Storage image upload middleware
  Public URL format after upload:
  https://storage.googleapis.com/<bucket>/<filename>
*/

let bucket = null;
let gcsInitAttempted = false;

function getBucket() {
  if (bucket) return bucket;
  if (gcsInitAttempted) return null;
  gcsInitAttempted = true;

  const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  const bucketName = process.env.GCS_BUCKET_NAME;

  if (!credentialsJson || !bucketName) {
    console.warn("GCS is not configured: missing GOOGLE_CREDENTIALS_JSON or GCS_BUCKET_NAME.");
    return null;
  }

  try {
    const credentials = JSON.parse(credentialsJson);
    const storage = new Storage({ credentials });
    bucket = storage.bucket(bucketName);
    return bucket;
  } catch (err) {
    console.warn("Invalid GOOGLE_CREDENTIALS_JSON. GCS uploads disabled:", err.message);
    return null;
  }
}

// Buffer uploads in memory; no temporary disk files.
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
  After this runs, req.file.path holds the public GCS URL.
*/
export function uploadImage(req, res, next) {
  multerInstance(req, res, async (err) => {
    if (err) return next(err);
    if (!req.file) return next(); // controller returns 400 "No image file provided"

    const activeBucket = getBucket();
    if (!activeBucket) {
      return next(new Error("Image upload is not configured. Set GOOGLE_CREDENTIALS_JSON and GCS_BUCKET_NAME."));
    }

    try {
      const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
      const filename = `menu/${uuidv4()}${ext}`;
      const blob = activeBucket.file(filename);

      await blob.save(req.file.buffer, {
        contentType: req.file.mimetype,
        metadata: {
          cacheControl: "public, max-age=31536000",
        },
      });

      const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${filename}`;
      req.file.path = publicUrl;

      next();
    } catch (uploadErr) {
      console.error("GCS upload failed:", uploadErr.message);
      next(new Error("Image upload to Google Cloud Storage failed: " + uploadErr.message));
    }
  });
}

/*
  deleteGCSImage

  Deletes a blob from GCS by its public URL.
  Called by menu.controller.js when a menu item is deleted or its image replaced.
*/
export async function deleteGCSImage(imageUrl) {
  if (!imageUrl) return;

  const activeBucket = getBucket();
  if (!activeBucket) return;

  try {
    const url = new URL(imageUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const objectPath = segments.slice(1).join("/");

    if (!objectPath) return;

    await activeBucket.file(objectPath).delete({ ignoreNotFound: true });
    console.log(`Deleted GCS object: ${objectPath}`);
  } catch (err) {
    console.warn(`Could not delete GCS image \"${imageUrl}\":`, err.message);
  }
}
