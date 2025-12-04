// backend/services/parentAuthService.js
import bcrypt from "bcryptjs";

import { pool } from "../db.js";

function mapParent(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    notify_channel: row.notify_channel,
    telegram_chat_id: row.telegram_chat_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getParentById(id) {
  const result = await pool.query(
    "SELECT id, email, name, phone, telegram_chat_id, notify_channel, created_at, updated_at FROM parents WHERE id = $1",
    [id]
  );

  return mapParent(result.rows[0]);
}

export async function getParentByEmail(email) {
  const result = await pool.query(
    "SELECT id, email, password_hash, name, phone, telegram_chat_id, notify_channel, created_at, updated_at FROM parents WHERE email = $1",
    [email]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    ...mapParent(row),
    password_hash: row.password_hash,
  };
}

export async function createParent({ email, password, name, phone }) {
  const existing = await pool.query("SELECT 1 FROM parents WHERE email = $1", [
    email,
  ]);

  if (existing.rows.length > 0) {
    const error = new Error("email_in_use");
    error.code = "email_in_use";
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const insert = await pool.query(
    `
      INSERT INTO parents (email, password_hash, name, phone)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, name, phone, notify_channel, telegram_chat_id, created_at, updated_at
    `,
    [email, passwordHash, name || null, phone || null]
  );

  return mapParent(insert.rows[0]);
}

export async function verifyParentCredentials({ email, password }) {
  const parent = await getParentByEmail(email);

  if (!parent || !parent.password_hash) {
    return null;
  }

  const isValid = await bcrypt.compare(password, parent.password_hash);
  if (!isValid) return null;

  const { password_hash, ...publicParent } = parent;
  return publicParent;
}

export async function getChildrenForParent(parentId) {
  const result = await pool.query(
    `
      SELECT id, first_name, last_name, grade, is_active
      FROM children
      WHERE parent_id = $1
      ORDER BY created_at DESC
    `,
    [parentId]
  );

  return result.rows;
}
