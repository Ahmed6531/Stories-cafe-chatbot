import express from "express";
import multer from "multer";

const router = express.Router();
const MAX_BYTES = 25 * 1024 * 1024; // Groq STT hard limit: 25 MB
const ALLOWED_MIME_PREFIX = "audio/";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

router.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "Missing GROQ_API_KEY on backend" });
    }

    if (!req.file?.buffer || req.file.size === 0) {
      return res.status(400).json({ error: "Missing or empty audio file (field: audio)" });
    }

    if (!req.file.mimetype?.startsWith(ALLOWED_MIME_PREFIX)) {
      return res.status(415).json({ error: `Unsupported file type: ${req.file.mimetype}` });
    }

    const model = process.env.STT_MODEL || "whisper-large-v3-turbo";
    const language = process.env.STT_LANGUAGE || "en";
    const prompt = process.env.STT_PROMPT ||
      "latte cappuccino americano espresso mocha macchiato frap frappuccino " +
      "flat white matcha chai oat milk almond milk whole milk skim milk " +
      "large medium small iced hot decaf extra shot no foam vanilla caramel hazelnut";

    const mimeType = req.file.mimetype || "audio/wav";
    const filename = req.file.originalname || "speech.wav";

    const formData = new FormData();
    formData.append("model", model);
    formData.append("language", language);
    formData.append("response_format", "json");
    formData.append("prompt", prompt);
    formData.append("file", new Blob([req.file.buffer], { type: mimeType }), filename);

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: formData,
    });

    const payload = await response.json();

    if (!response.ok) {
      const message = payload?.error?.message || "Transcription failed";
      return res.status(response.status).json({ error: message });
    }

    return res.json({ text: payload?.text || "" });
  } catch (err) {
    console.error("Transcription route error:", err);
    return res.status(500).json({ error: "Transcription failed" });
  }
});

// multer size-limit error -> clean 413
router.use((err, _req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Audio file exceeds 25 MB limit" });
  }
  next(err);
});

export default router;
