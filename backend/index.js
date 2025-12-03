import express from "express";
import cors from "cors";
import OpenAI from "openai";

import pkg from "pg";
const { Pool } = pkg;

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();

app.use(cors());
app.use(express.json());

// Подключение к Supabase Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Создаём JWT-токен для ребёнка
function signChildToken(child) {
  return jwt.sign(
    { child_id: child.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || "7d" }
  );
}

// Middleware: проверяем токен в каждом защищённом запросе
function authMiddleware(req, res, next) {
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

// ----------------------
// Клиент OpenAI
// ----------------------

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/*
  -------------------------------
     SYSTEM PROMPT — ТАБЛИЦА 
          УМНОЖЕНИЯ 1–10
  -------------------------------
*/

const MULTIPLICATION_PROMPT = `
Ты — генератор заданий по таблице умножения для детей 2–3 класса.

Твоя задача — каждый раз придумывать НОВЫЙ пример на умножение
в пределах таблицы умножения (от 1×1 до 10×10).

ТРЕБОВАНИЯ:

1. Всегда создавай ОДИН пример на умножение.
2. Используй только натуральные числа от 1 до 10 включительно.
3. Формат вопроса строго:
   "Сколько будет A × B?"
4. Не используй деление, сложение, вычитание, дроби, скобки.
5. Обязательно делай разнообразные примеры — не повторяй один и тот же A × B слишком часто.
6. Используй знак умножения: ×
7. Ответ ВСЕГДА одно число.
8. Возвращай ровно такой JSON:

{
  "question": "Сколько будет A × B?",
  "answer": ЧИСЛО,
  "answer_type": "number",
  "grade": "2 класс",
  "est_time": "1 минута"
}

Никаких пояснений, только JSON.
`;

/*
  -------------------------------
   ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ
   ДЛЯ PUBLIC_ID РЕБЁНКА
  -------------------------------
*/

function generatePublicId(dbId) {
  // Простой вариант в стиле ВК: "id123"
  return "id" + String(dbId);
}

/*
  -------------------------------
       РЕГИСТРАЦИЯ РЕБЁНКА
   POST /api/children/register
  -------------------------------
*/

app.post("/api/children/register", async (req, res) => {
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

app.post("/api/children/login", async (req, res) => {
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

app.get("/api/children/me", authMiddleware, async (req, res) => {
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
       /generate-task
  -------------------------------
*/

app.get("/generate-task", async (req, res) => {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: MULTIPLICATION_PROMPT },
        { role: "user", content: "Сгенерируй 1 задачу по таблице умножения." },
      ],
      max_tokens: 200,
      temperature: 1,
    });

    let raw = completion.choices?.[0]?.message?.content || "";

    // Если модель вернула что-то НЕ JSON — очищаем обёртки ```json
    raw = raw.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({
        error: "Модель вернула неверный JSON",
        raw,
      });
    }

    res.json(data);
  } catch (err) {
    console.error("Ошибка /generate-task:", err);
    res.status(500).json({ error: "Ошибка генерации задачи" });
  }
});

/*
  -------------------------------
       /explain
  -------------------------------
*/

app.post("/explain", async (req, res) => {
  const { question, correctAnswer, userAnswer } = req.body || {};

  if (!question || correctAnswer === undefined || userAnswer === undefined) {
    return res.status(400).json({
      error: "Нужны поля: question, correctAnswer, userAnswer",
    });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Ты добрый учитель математики для детей 2–3 класса. Объясняй очень простыми словами, коротко. Не пиши длинных вступлений.",
        },
        {
          role: "user",
          content:
            `Задача: ${question}\n` +
            `Правильный ответ: ${correctAnswer}\n` +
            `Ответ ребёнка: ${userAnswer}\n\n` +
            "Дай 3 простых шага решения.",
        },
      ],
      max_tokens: 150,
      temperature: 0.4,
    });

    const explanation =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Подсказка недоступна.";

    res.json({ explanation });
  } catch (err) {
    console.error("Ошибка /explain:", err);
    res.status(500).json({ error: "Ошибка подсказки" });
  }
});

/*
  -------------------------------
     /save-session — сохранить
       статистику сессии
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
  /api/children/save-session
  Сохраняет сессию, привязанную
  к текущему ребёнку (по токену)
  -------------------------------
*/

app.post("/api/children/save-session", authMiddleware, async (req, res) => {
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

app.get("/api/children/my-sessions", authMiddleware, async (req, res) => {
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
