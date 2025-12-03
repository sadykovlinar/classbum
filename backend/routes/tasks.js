// backend/routes/tasks.js
import express from "express";
import OpenAI from "openai";

const router = express.Router();

// Клиент OpenAI
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
       /generate-task
  -------------------------------
*/
router.get("/generate-task", async (req, res) => {
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
router.post("/explain", async (req, res) => {
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

export default router;
