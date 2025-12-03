// backend/utils/auth.js
import jwt from "jsonwebtoken";

export function signChildToken(child) {
  return jwt.sign(
    { child_id: child.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || "7d" }
  );
}

// Простой public_id типа "id123"
export function generatePublicId(dbId) {
  return "id" + String(dbId);
}
