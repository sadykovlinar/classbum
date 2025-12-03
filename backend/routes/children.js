// backend/routes/children.js
import express from "express";
import bcrypt from "bcryptjs";

import { pool } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { signChildToken, generatePublicId } from "../utils/auth.js";

const router = express.Router();

/*
  -------------------------------
       РЕГИСТРАЦИЯ РЕБЁНКА
   POST /api/children/register
  -------------------------------
*/
router.post("/register", async (req, res) => {
  try {
    const {
      login,
      password,
      first_name,
      last_name,
      class: schoolClass,
      age,
      gender,
    } = req.body || {};

    if (!login || !password || !first_name || !last_name) {
      return res
        .status(400)
        .json({ ok: false, error: "fill_required_fields" });
    }

    // Проверяем, что логин свободен
    const existing = await pool.query(
      "SELECT id FROM children WHERE login = $1",
      [login]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ ok: false, error: "login_taken" });
    }

    // Хэшируем пароль
    const passwordHash = await bcrypt.hash(password, 10);

    // Сначала создаём запись с временным public_id
    const insertResult = await pool.query(
      `
      INSERT INTO children (public_id, login, password_hash, first_name, last_name, class, age, gender)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, public_id, login, first_name, last_name, class, age, gender, created_at
      `,
      [
        "temp",
        login,
        passwordHash,
        first_name,
        last_name,
        schoolClass || null,
        age || null,
        gender || null,
      ]
    );

    let child = insertResult.rows[0];

    // Генерируем красивый public_id на основе id
    const publicId = generatePublicId(child.id);

    // Обновляем в базе
    await pool.query("UPDATE children SET public_id = $1 WHERE id = $2", [
      publicId,
      child.id,
    ]);

    child.public_id = publicId;

    const token = signChildToken(child);

    res.json({
      ok: true,
      token,
      child: {
        id: child.id,
        public_id: child.public_id,
        login: child.login,
        first_name: child.first_name,
        last_name: child.last_name,
        class: child.class,
        age: child.age,
        gender: child.gender,
        created_at: child.created_at,
      },
    });
  } catch (e) {
    console.error("children/register error:", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

/*
  -------------------------------
         ЛОГИН РЕБЁНКА
    POST /api/children/login
  -------------------------------
*/
router.post("/login", async (req, res) => {
  try {
    const { login, password } = req.body || {};

    if (!login || !password) {
      return res
        .status(400)
        .json({ ok: false, error: "empty_login_or_password" });
    }

    const result = await pool.query(
      `
      SELECT id, public_id, login, password_hash, first_name, last_name, class, age, gender, created_at
      FROM children
      WHERE login = $1
      `,
      [login]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, error: "user_not_found" });
    }

    const child = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, child.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ ok: false, error: "wrong_password" });
    }

    const token = signChildToken(child);
    delete child.password_hash;

    res.json({
      ok: true,
      token,
      child,
    });
  } catch (e) {
    console.error("children/login error:", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

/*
  -------------------------------
   ПОЛУЧЕНИЕ ПРОФИЛЯ ТЕКУЩЕГО
   РЕБЁНКА (ПО ТОКЕНУ)
     GET /api/children/me
  -------------------------------
*/
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const childId = req.childId;

    const result = await pool.query(
      `
      SELECT id, public_id, login, first_name, last_name, class, age, gender, created_at
      FROM children
      WHERE id = $1
      `,
      [childId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    res.json({ ok: true, child: result.rows[0] });
  } catch (e) {
    console.error("children/me error:", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

/*
  -------------------------------
  /api/children/save-session
  Сохраняет сессию, привязанную
  к текущему ребёнку (по токену)
  -------------------------------
*/
router.post("/save-session", authMiddleware, async (req, res) => {
  try {
    const childId = req.childId;

    const {
      mode,
      total_wrong,
      total_hints,
      total_time_ms,
      tasks,
    } = req.body || {};

    if (!Array.isArray(tasks)) {
      return res.status(400).json({
        ok: false,
        error: "tasks_must_be_array",
      });
    }

    // Достаём имя ребёнка (чисто для красоты в аналитике)
    const childResult = await pool.query(
      "SELECT first_name, last_name FROM children WHERE id = $1",
      [childId]
    );
    const childRow = childResult.rows[0];
    const childName = childRow
      ? `${childRow.first_name} ${childRow.last_name}`.trim()
      : null;

    const insertQuery = `
      INSERT INTO session_stats
        (child_id, child_name, mode, total_wrong, total_hints, total_time_ms, tasks)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `;

    const values = [
      childId,
      childName,
      mode || "multiplication",
      total_wrong ?? 0,
      total_hints ?? 0,
      total_time_ms ?? 0,
      JSON.stringify(tasks),
    ];

    const result = await pool.query(insertQuery, values);

    return res.json({
      ok: true,
      session_id: result.rows[0].id,
      created_at: result.rows[0].created_at,
    });
  } catch (err) {
    console.error("/api/children/save-session error:", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

/*
  -------------------------------
  /api/children/my-sessions
  Возвращает список сессий
  текущего ребёнка
  -------------------------------
*/
router.get("/my-sessions", authMiddleware, async (req, res) => {
  try {
    const childId = req.childId;

    const result = await pool.query(
      `
      SELECT
        id,
        mode,
        total_wrong,
        total_hints,
        total_time_ms,
        tasks,
        created_at
      FROM session_stats
      WHERE child_id = $1
      ORDER BY created_at DESC
      LIMIT 20
      `,
      [childId]
    );

    return res.json({
      ok: true,
      sessions: result.rows,
    });
  } catch (err) {
    console.error("/api/children/my-sessions error:", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

export default router;
