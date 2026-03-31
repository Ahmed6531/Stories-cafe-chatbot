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

export function authenticateOptional(req, res, next) {
  const bearer = req.headers.authorization;
  const cookieToken = req.cookies?.token;

  let token = null;
  if (bearer && bearer.startsWith("Bearer ")) {
    token = bearer.split(" ")[1];
  } else if (cookieToken) {
    token = cookieToken;
  }

  if (!token) {
    return next();
  }

  try {
    req.user = verifyToken(token);
  } catch {
    // Ignore invalid optional auth so anonymous checkout continues to work.
  }

  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Insufficient permissions" },
        });
      }
      next();
    });
  };
}
