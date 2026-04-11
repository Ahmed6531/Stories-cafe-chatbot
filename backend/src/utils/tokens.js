import { createHmac, timingSafeEqual } from "crypto";

function computeHmac(data) {
  return createHmac("sha256", process.env.TOKEN_SECRET)
    .update(data)
    .digest("hex");
}

export function generateVerificationToken(email) {
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  const payload = Buffer.from(`${email}:${expiry}`).toString("base64");
  const hmac = computeHmac(payload);
  return `${payload}.${hmac}`;
}

export function verifyVerificationToken(tokenString) {
  const dotIndex = tokenString.lastIndexOf(".");
  if (dotIndex === -1) throw new Error("Invalid token format");

  const payload = tokenString.slice(0, dotIndex);
  const receivedHmac = tokenString.slice(dotIndex + 1);

  const expectedHmac = computeHmac(payload);

  const received = Buffer.from(receivedHmac, "hex");
  const expected = Buffer.from(expectedHmac, "hex");

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error("Invalid token signature");
  }

  const decoded = Buffer.from(payload, "base64").toString("utf8");
  const colonIndex = decoded.lastIndexOf(":");
  if (colonIndex === -1) throw new Error("Invalid token payload");

  const email = decoded.slice(0, colonIndex);
  const expiry = Number(decoded.slice(colonIndex + 1));

  if (isNaN(expiry)) throw new Error("Invalid token payload");
  if (Date.now() > expiry) throw new Error("Verification token has expired");

  return { email };
}
