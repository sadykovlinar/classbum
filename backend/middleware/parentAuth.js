// backend/middleware/parentAuth.js
import jwt from "jsonwebtoken";

import { getParentById } from "../services/parentAuthService.js";

export async function parentAuthMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const [, token] = auth.split(" "); // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ ok: false, error: "no_token" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!payload || payload.role !== "parent" || !payload.parent_id) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const parent = await getParentById(payload.parent_id);

    if (!parent) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    req.parent = parent;
    req.parentId = parent.id;
    next();
  } catch (e) {
    console.error("Parent JWT verify error:", e);
    return res.status(401).json({ ok: false, error: "invalid_token" });
  }
}
