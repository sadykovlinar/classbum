// backend/middleware/auth.js
import jwt from "jsonwebtoken";

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const [, token] = auth.split(" "); // "Bearer xxx"

  if (!token) {
    return res.status(401).json({ ok: false, error: "no_token" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.childId = payload.child_id;
    next();
  } catch (e) {
    console.error("JWT verify error:", e);
    return res.status(401).json({ ok: false, error: "invalid_token" });
  }
}
