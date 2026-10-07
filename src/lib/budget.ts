/**
 * Парсинг бюджета из свободного текста площадки.
 *
 * FL.ru отдаёт цену как текст: "50 000 ₽ – 80 000 ₽", "от 10 000 руб",
 * "до 50 000", "1 500 000 руб", "Договорная".
 *
 * Раньше бюджет вырезался регекспом /[^0-9]/g, поэтому диапазон склеивался
 * в одно число: "50 000 ₽ – 80 000 ₽" → 5000080000.
 * Здесь разбираем границы корректно.
 *
 * Важно: в JavaScript \b не работает с кириллицей, поэтому слова
 * «от» и «до» определяем по токенам, а не через границы слова.
 */

export interface ParsedBudget {
  /** Исходный текст, как его отдала площадка */
  raw: string;
  /** Нижняя граница (для «от X» — она же) */
  min?: number;
  /** Верхняя граница (для «до X» — она же) */
  max?: number;
}

/** Неразрывные и узкие пробелы, которые площадки суют внутрь чисел */
const NBSP_RE = /[\u00A0\u202F\u2009\u2007\u2060]/g;
/** Все виды тире/минусов → обычный дефис */
const DASH_RE = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;
/** Группа цифр, возможно с пробелами внутри: "1 500 000" */
const NUM = "(\\d[\\d\\s]*\\d|\\d)";
/** Слово «до» как отдельное слово (кириллица, без \b) */
const UP_TO_RE = /(^|[^\p{L}\p{N}])до([^\p{L}\p{N}]|$)/giu;
/** Обозначения валюты — мешают разбору диапазона («50 000 ₽ – 80 000 ₽») */
const CURRENCY_RE = /(₽|руб\.?|р\.|rub)/gi;

function toNumber(value: string): number | undefined {
  const digits = value.replace(/\s+/g, "");
  if (!digits) return undefined;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Разбивает текст на слова/числа — для определения «от»/«до» */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Разбирает текст бюджета. Возвращает границы, если числа нашлись,
 * иначе только исходный текст (например, «Договорная»).
 */
export function parseBudget(raw?: string | null): ParsedBudget | undefined {
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw).replace(NBSP_RE, " ").trim();
  if (!text) return undefined;

  const normalized = text.replace(DASH_RE, "-");
  const tokens = tokenize(normalized);
  const hasUpTo = tokens.includes("до");
  const hasFrom = tokens.includes("от");

  // Убираем «до» (чтобы диапазон читался через дефис) и обозначения валюты
  const prepared = normalized
    .replace(UP_TO_RE, "$1-$2")
    .replace(CURRENCY_RE, " ");

  // Диапазон: "50 000 - 80 000", "10 000 - 20 000 руб", "от 10 000 до 20 000"
  const range = prepared.match(new RegExp(`${NUM}\\s*-\\s*${NUM}`, "u"));
  if (range) {
    const first = toNumber(range[1]);
    const second = toNumber(range[2]);
    if (first !== undefined && second !== undefined) {
      return { raw: text, min: Math.min(first, second), max: Math.max(first, second) };
    }
  }

  // Одиночное число: "10 000 руб", "от 10 000", "до 50 000"
  const single = prepared.match(new RegExp(NUM, "u"));
  if (single) {
    const value = toNumber(single[1]);
    if (value !== undefined) {
      if (hasUpTo && !hasFrom) return { raw: text, max: value };
      if (hasFrom && !hasUpTo) return { raw: text, min: value };
      return { raw: text, min: value, max: value };
    }
  }

  // «Договорная», «по договорённости» — цифр нет
  return { raw: text };
}

/**
 * Значение бюджета для фильтров и гейтов: нижняя граница, иначе верхняя.
 * Для диапазона это то, на что клиент готов рассчитывать минимум.
 */
export function budgetGateValue(budget?: ParsedBudget): number | undefined {
  return budget?.min ?? budget?.max;
}

/** Человекочитаемый текст бюджета для логов и уведомлений */
export function formatBudget(budget?: ParsedBudget): string {
  if (!budget) return "Договорная";
  const { min, max, raw } = budget;
  if (min !== undefined && max !== undefined && min !== max) {
    return `${min} – ${max} руб`;
  }
  const single = min ?? max;
  if (single !== undefined) return `${single} руб`;
  return raw || "Договорная";
}
