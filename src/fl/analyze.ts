/**
 * analyze.ts — краткий анализ заказа силами LLM.
 *
 * Отвечает на два вопроса, которые важны до открытия заказа руками:
 *  1) сможем ли мы это сделать;
 *  2) стоит ли это своих денег.
 *
 * Данные берутся из карточки заказа в ленте (название, описание, бюджет,
 * категория, число откликов) — без захода на страницу проекта, которая
 * недоступна без авторизованной сессии FL.ru.
 */

import type { LLMProvider } from "../llm/types.js";

export interface TaskForAnalysis {
  title: string;
  description?: string;
  budgetRaw?: string;
  categoryName?: string;
  responsesCount?: number;
  city?: string;
}

/** Сколько символов описания отдаём модели — с запасом, но без перебора. */
const MAX_DESCRIPTION_CHARS = 1500;

/**
 * Собрать промпт. Формат ответа жёстко задан: ровно четыре строки,
 * чтобы уведомление оставалось коротким и читаемым.
 */
function buildPrompt(task: TaskForAnalysis, specialties: string[]): string {
  const description = (task.description ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION_CHARS);

  return [
    "Ты — помощник фрилансера (веб-разработка, Telegram-боты, парсинг, автоматизация).",
    "Оцени заказ с FL.ru. Ответь РОВНО четырьмя строками, без вступлений и пояснений:",
    "🤖 Вердикт: можем / сомнительно / не наш профиль",
    "⏱ Оценка: срок выполнения (например «2–3 дня»)",
    "💰 Адекватная цена: вилка в рублях и сравнение с бюджетом заказа (есть запас / в рынке / мало)",
    "⚔️ Конкуренция: сколько откликов и стоит ли спешить",
    "",
    `Наши навыки: ${specialties.length ? specialties.join(", ") : "не заданы"}`,
    `Заказ: ${task.title}`,
    `Бюджет: ${task.budgetRaw ?? "не указан"}`,
    `Категория: ${task.categoryName ?? "не указана"}`,
    `Откликов: ${task.responsesCount ?? "неизвестно"}`,
    `Город: ${task.city ?? "не указан"}`,
    `Описание: ${description || "нет"}`,
  ].join("\n");
}

/**
 * Проанализировать заказ. При любой ошибке возвращает undefined —
 * уведомление всё равно должно уйти, просто без блока анализа.
 */
export async function analyzeTask(
  llm: LLMProvider,
  task: TaskForAnalysis,
  specialties: string[],
  timeoutMs = 30_000,
): Promise<string | undefined> {
  try {
    const response = await Promise.race([
      llm.chat([{ role: "user", content: buildPrompt(task, specialties) }]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`таймаут ${timeoutMs} мс`)), timeoutMs),
      ),
    ]);

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { text: string }).text)
      .join("\n")
      .trim();

    return text || undefined;
  } catch (err) {
    console.warn(
      "[FL.ru] ⚠️ Анализ заказа не удался:",
      err instanceof Error ? err.message : String(err),
    );
    return undefined;
  }
}
