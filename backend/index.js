// backend/index.js
import express from "express";
import cors from "cors";

import { pool } from "./db.js";
import childrenRouter from "./routes/children.js";
import tasksRouter from "./routes/tasks.js";

const app = express();

app.use(cors());
app.use(express.json());

// Подключение роутов для /api/children/...
app.use("/api/children", childrenRouter);

// Подключение роутов для задач (/generate-task, /explain)
app.use("/", tasksRouter);

// Проверяем, что база доступна (вывод в логи Replit)
(async () => {
  try {
    const result = await pool.query("SELECT NOW() as now");
    console.log("PostgreSQL connected, time:", result.rows[0].now);
  } catch (e) {
    console.error("PostgreSQL connection error:", e);
  }
})();

// Небольшой debug-роут, чтобы можно было проверить из браузера
app.get("/debug-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, now: result.rows[0].now });
  } catch (e) {
    console.error("Ошибка /debug-db:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/*
  -------------------------------
   ПОЛУЧЕНИЕ ПРОФИЛЯ ПО PUBLIC_ID
   GET /api/child/:public_id
   (можно использовать для шаринга)
  -------------------------------
*/

app.get("/api/child/:public_id", async (req, res) => {
  try {
    const { public_id } = req.params;

    const result = await pool.query(
      `
      SELECT id, public_id, login, first_name, last_name, class, age, gender, created_at
      FROM children
      WHERE public_id = $1
      `,
      [public_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ребёнок не найден" });
    }

    res.json(result.rows[0]);
  } catch (e) {
    console.error("Get child error:", e);
    res
      .status(500)
      .json({ error: "Ошибка на сервере при получении профиля" });
  }
});

/*
  -------------------------------
     /save-session — сохранить
       статистику сессии (общая)
  -------------------------------
*/

app.post("/save-session", async (req, res) => {
  try {
    const {
      child_name,
      mode,
      total_wrong,
      total_hints,
      total_time_ms,
      tasks,
    } = req.body || {};

    // минимальная валидация
    if (!child_name || !mode || !Array.isArray(tasks)) {
      return res.status(400).json({
        error: "Нужны поля: child_name, mode, tasks[]",
      });
    }

    const insertQuery = `
      INSERT INTO session_stats
        (child_name, mode, total_wrong, total_hints, total_time_ms, tasks)
      VALUES
        ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `;

    const values = [
      child_name,
      mode,
      total_wrong ?? 0,
      total_hints ?? 0,
      total_time_ms ?? 0,
      JSON.stringify(tasks), // храним как jsonb
    ];

    const result = await pool.query(insertQuery, values);

    return res.json({
      ok: true,
      session_id: result.rows[0].id,
      created_at: result.rows[0].created_at,
    });
  } catch (err) {
    console.error("Ошибка /save-session:", err);
    return res.status(500).json({ error: "Не удалось сохранить сессию" });
  }
});

/*
  -------------------------------
   /last-session-stats — выдать
   последнюю сессию ребёнка
  -------------------------------
*/

app.get("/last-session-stats", async (req, res) => {
  try {
    const { child_name, mode } = req.query;

    if (!child_name) {
      return res.status(400).json({ error: "Нужен параметр child_name" });
    }

    const query = `
      SELECT
        child_name,
        mode,
        total_wrong,
        total_hints,
        total_time_ms,
        tasks,
        created_at
      FROM session_stats
      WHERE child_name = $1
        AND ($2::text IS NULL OR mode = $2::text)
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const values = [child_name, mode || null];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Сессий пока нет" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Ошибка /last-session-stats:", err);
    return res.status(500).json({ error: "Не удалось получить статистику" });
  }
});

// ----------------------
// Корневой маршрут
// ----------------------

app.get("/", (req, res) => {
  res.send("Classbum Multiplication API is running");
});

// ----------------------
// Запуск сервера
// ----------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
