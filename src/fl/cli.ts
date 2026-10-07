/**
 * FL.ru cli.ts — Парсинг заказов с fl.ru
 *
 * FL.ru отдаёт HTML с сервера (без JS-рендеринга).
 * Парсим через cheerio с задержками, чтобы не нагружать.
 */

import * as cheerio from "cheerio";
import { parseBudget } from "../lib/budget.js";
import { type FlTask, type FlSearchResult, type FlParserConfig } from "./types.js";

/** Базовая задержка между запросами (мс) */
const REQUEST_DELAY_MS = 5_000;

/** Время последнего запроса — для соблюдения задержки */
let lastRequestTime = 0;

/** User-Agent для запросов */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Конфигурация по умолчанию */
export const DEFAULT_FL_CONFIG: FlParserConfig = {
  categories: [],
  minBudget: 0,
  maxBudget: 0,
  keywords: [],
  excludeKeywords: [],
  pollIntervalMs: 60_000,
};

// ═══════════════════════════════════════
//  HTTP-запрос с задержкой
// ═══════════════════════════════════════

async function fetchWithDelay(url: string): Promise<string> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;

  if (elapsed < REQUEST_DELAY_MS) {
    const wait = REQUEST_DELAY_MS - elapsed;
    await new Promise((r) => setTimeout(r, wait));
  }

  lastRequestTime = Date.now();

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  return res.text();
}

// ═══════════════════════════════════════
//  Парсинг проектов со страницы списка
// ═══════════════════════════════════════

function parseProjectsList(html: string, sourceUrl: string): FlTask[] {
  const $ = cheerio.load(html);
  const tasks: FlTask[] = [];

  // Каждая карточка проекта — div.b-post
  $("div.b-post").each((_i, el) => {
    const $post = $(el);
    const now = Date.now();

    // ID проекта (из data-disposable-project-id или href)
    const $link = $post.find("a[data-disposable-project-id]").first();
    const projectId = $link.attr("data-disposable-project-id") || "";
    if (!projectId) return;

    // Название
    const title = $link.text().trim() || "Без названия";

    // URL
    const href = $link.attr("href") || "";
    const url = href.startsWith("http") ? href : `https://www.fl.ru${href}`;

    // Описание
    const description = $post.find("div.b-post__txt.text-5").first().text().trim();

    // Цена (может быть числом, диапазоном или "Договорная")
    let budget: number | undefined;
    let budgetMin: number | undefined;
    let budgetMax: number | undefined;
    let budgetRaw: string | undefined;
    const $priceSpan = $post.find("span.b-post__price, div.b-post__price span.text-4").first();
    const priceText = $priceSpan.text().trim();
    if (priceText) {
      const parsed = parseBudget(priceText);
      if (parsed) {
        budgetRaw = parsed.raw;
        budgetMin = parsed.min;
        budgetMax = parsed.max;
        budget = parsed.min ?? parsed.max;
      }
    }

    // Категория (из ссылки на категорию)
    let categoryId = "";
    let categoryName = "";
    const catHtml = $post.html() || "";
    const catMatch = catHtml.match(/href="([^"]*\/projects\/category\/[^"]*)"[^>]*>([^<]*)</);
    if (catMatch) {
      const parts = catMatch[1].replace(/\/+$/, "").split("/");
      categoryId = parts[parts.length - 1] || "";
      categoryName = catMatch[2].trim() || categoryId;
    }

    // Просмотры
    let views = 0;
    const viewsText = $post
      .find("div.b-post__txt.b-post__txt_fontsize_11")
      .text()
      .trim();
    const viewsMatch = viewsText.match(/(\d+)\s*просмотр/);
    if (viewsMatch) {
      views = parseInt(viewsMatch[1], 10) || 0;
    }

    // Количество откликов
    let responsesCount = 0;
    const responsesMatch = viewsText.match(/(\d+)\s*отклик/);
    if (responsesMatch) {
      responsesCount = parseInt(responsesMatch[1], 10) || 0;
    }

    // Файлы — проверяем по классу или по тексту
    const hasFiles = $post.find("svg").length > 0 && ($post.html() || "").includes("clip");

    // Город
    let city: string | undefined;
    const $cityEl = $post.find("span.text-nowrap").first();
    const cityText = $cityEl.text().trim();
    if (cityText && !cityText.includes("руб") && !cityText.includes("проект")) {
      city = cityText;
    }

    tasks.push({
      id: projectId,
      title,
      description,
      budget,
      budgetMin,
      budgetMax,
      budgetRaw,
      currency: "RUB",
      categoryId,
      categoryName,
      url,
      createdAt: now,
      updatedAt: now,
      status: "open",
      views,
      responsesCount,
      hasFiles,
      city,
    });
  });

  return tasks;
}

// ═══════════════════════════════════════
//  Основные функции (публичный API)
// ═══════════════════════════════════════

/**
 * Получить список доступных заказов с FL.ru
 */
export async function getAvailableTasks(
  config?: Partial<FlParserConfig>,
): Promise<FlSearchResult> {
  try {
    const cats = config?.categories || [];

    // Строим URL
    let url = "https://www.fl.ru/projects/";
    if (cats.length > 0) {
      // Если есть категории — добавляем первую
      url = `https://www.fl.ru/projects/category/${encodeURIComponent(cats[0])}/`;
    }

    console.log(`[FL.ru] Запрашиваю ${url}`);
    const html = await fetchWithDelay(url);
    const allTasks = parseProjectsList(html, url);

    // Фильтруем
    const tasks = allTasks.filter((t) => applyFilters(t, config));

    // Проверяем, есть ли следующая страница
    const $ = cheerio.load(html);
    const hasMore = $('a[rel="next"], a:contains("Следующая")').length > 0;

    console.log(`[FL.ru] Получено ${allTasks.length} заказов, после фильтра: ${tasks.length}`);

    return {
      tasks,
      total: tasks.length,
      page: 1,
      hasMore,
    };
  } catch (err) {
    console.warn(
      "[FL.ru] ⚠️ Ошибка:",
      err instanceof Error ? err.message : String(err),
    );
    return { tasks: [], total: 0, page: 1, hasMore: false };
  }
}

/**
 * Получить детали одного заказа (загружаем страницу заказа)
 */
export async function getTaskDetails(taskId: string): Promise<FlTask | null> {
  try {
    const url = `https://www.fl.ru/projects/${taskId}/`;
    const html = await fetchWithDelay(url);
    const $ = cheerio.load(html);

    const title = $("h1").first().text().trim() || "Без названия";
    const description = $('div[itemprop="description"]').text().trim() ||
      $("div.project-description").text().trim() || "";

    let budget: number | undefined;
    let budgetMin: number | undefined;
    let budgetMax: number | undefined;
    let budgetRaw: string | undefined;
    const priceText = $('span[itemprop="price"]').text().trim() ||
      $(".project-price").text().trim();
    const parsed = parseBudget(priceText);
    if (parsed) {
      budgetRaw = parsed.raw;
      budgetMin = parsed.min;
      budgetMax = parsed.max;
      budget = parsed.min ?? parsed.max;
    }

    return {
      id: taskId,
      title,
      description,
      budget,
      budgetMin,
      budgetMax,
      budgetRaw,
      currency: "RUB",
      categoryId: "",
      categoryName: "",
      url,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "open",
      views: 0,
      responsesCount: 0,
      hasFiles: false,
    };
  } catch (err) {
    console.warn(`[FL.ru] ⚠️ getTaskDetails(${taskId}):`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Поиск по ключевым словам
 */
export async function searchTasks(
  query: string,
  config?: Partial<FlParserConfig>,
): Promise<FlSearchResult> {
  return getAvailableTasks({
    ...config,
    keywords: [query, ...(config?.keywords || [])],
  });
}

// ═══════════════════════════════════════
//  Фильтрация
// ═══════════════════════════════════════

function applyFilters(task: FlTask, config?: Partial<FlParserConfig>): boolean {
  if (!config) return true;

  const text = `${task.title} ${task.description}`.toLowerCase();

  // Ключевые слова (OR)
  if (config.keywords?.length) {
    const match = config.keywords.some((kw) => text.includes(kw.toLowerCase()));
    if (!match) return false;
  }

  // Исключения
  if (config.excludeKeywords?.length) {
    const exclude = config.excludeKeywords.some((kw) => text.includes(kw.toLowerCase()));
    if (exclude) return false;
  }

  // Бюджет: сравниваем границы диапазона, а не склеенное число
  const budgetLow = task.budgetMin ?? task.budget;
  const budgetHigh = task.budgetMax ?? task.budget;
  if (config.minBudget && budgetHigh !== undefined && budgetHigh < config.minBudget) return false;
  if (config.maxBudget && budgetLow !== undefined && budgetLow > config.maxBudget) return false;

  return true;
}

/**
 * Откликнуться на заказ — в разработке (требуется авторизация на FL.ru)
 */
export async function placeBid(
  taskId: string,
  _amount: string,
  _message: string,
): Promise<{ taskId: string; amount: string; status: string; error?: string }> {
  console.warn(`[FL.ru] ⚠️ placeBid(${taskId}) — отклики через API в разработке`);
  return {
    taskId,
    amount: _amount,
    status: "rejected",
    error: "В разработке",
  };
}

/**
 * Отправить сообщение — в разработке
 */
export async function sendMessage(_taskId: string, _content: string): Promise<void> {
  console.warn("[FL.ru] ⚠️ sendMessage — в разработке");
}
