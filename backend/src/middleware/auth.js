import { verifyToken } from "../utils/jwt.js";

export function requireAuth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }
}

export function requireRole(...roles) {
  return async (req, res, next) => {
    await new Promise((resolve) => requireAuth(req, res, resolve));
    if (!req.user) return; // requireAuth already sent the 401
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Insufficient permissions" },
      });
    }
    next();
  };
}
