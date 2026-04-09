import jwt from "jsonwebtoken";

export function signToken(payload) {
  if (!payload.id) throw new Error("JWT payload missing required field: id");
  if (!payload.role) throw new Error("JWT payload missing required field: role");

  const { id, email = null, role } = payload;

  return jwt.sign(
    { id, email, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN ?? "7d" }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw err;
  }
}
