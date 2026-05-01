import { Router } from "express";

const router = Router();

function getChatbotBaseUrl() {
  return (process.env.CHATBOT_URL || "http://localhost:8000").replace(/\/+$/, "");
}

router.post("/message", async (req, res) => {
  const chatbotBaseUrl = getChatbotBaseUrl();
  const upstreamUrl = `${chatbotBaseUrl}/chat/message`;

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
      },
      body: JSON.stringify(req.body ?? {}),
    });

    const contentType = upstreamRes.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await upstreamRes.json() : await upstreamRes.text();

    res.status(upstreamRes.status);
    if (isJson) return res.json(body);
    return res.send(body);
  } catch (err) {
    return res.status(502).json({
      error: { code: "CHATBOT_UNAVAILABLE", message: "Chat service unavailable" },
    });
  }
});

export default router;

