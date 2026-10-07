/**
 * Kwork cli.ts — Слой данных для kwork.ru
 *
 * Использует kwork-api через child_process (CommonJS → ESM bridge).
 *
 * Требуется: логин, пароль и последние 4 цифры телефона аккаунта Kwork.
 * Указываются в ~/.cashclaw/kwork-auth.json
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { type KworkProject, type KworkSearchResult, type KworkBid, type KworkAuth, type KworkTask, type KworkParserConfig } from "./types.js";
import { KworkApiClient, type KworkApiOptions } from "./kwork-api.js";

// ═══════════════════════════════════════
//  Singleton management
// ═══════════════════════════════════════

let _client: KworkApiClient | null = null;
let _clientReady = false;

function loadAuth(): KworkAuth | null {
  const AUTH_PATH = resolve(process.env.HOME || "/root", ".cashclaw/kwork-auth.json");
  if (!existsSync(AUTH_PATH)) return null;
  try {
    const raw = readFileSync(AUTH_PATH, "utf-8");
    return JSON.parse(raw) as KworkAuth;
  } catch {
    console.warn("[Kwork] ⚠️ Ошибка чтения kwork-auth.json");
    return null;
  }
}

async function getClient(): Promise<KworkApiClient | null> {
  if (_client && _clientReady) return _client;

  const auth = loadAuth();
  if (!auth) {
    console.warn("[Kwork] ⚠️ Нет файла ~/.cashclaw/kwork-auth.json");
    console.warn("[Kwork]   Создай файл с содержимым:");
    console.warn('[Kwork]   { "login": "your@email.com", "password": "...", "phone": "0000" }');
    return null;
  }

  try {
    const options: KworkApiOptions = {
      login: auth.login,
      password: auth.password,
      phone: auth.phone,
      proxy: auth.proxy || undefined,
      categories: [],
    };

    _client = new KworkApiClient(options);
    await _client.init();

    // Проверим авторизацию
    try {
      const me = await _client.getMe();
      console.log(`[Kwork] ✅ Авторизован как ${(me as Record<string, unknown>).username || "unknown"}`);
      _clientReady = true;
      return _client;
    } catch {
      console.warn("[Kwork] ⚠️ Не удалось авторизоваться. Проверь логин/пароль/телефон.");
      _client = null;
      return null;
    }
  } catch (err) {
    console.warn("[Kwork] ⚠️ Ошибка инициализации:", err instanceof Error ? err.message : String(err));
    _client = null;
    return null;
  }
}

// ═══════════════════════════════════════
//  Основные функции
// ═══════════════════════════════════════

/** Получить список доступных заказов с Kwork */
export async function getAvailableTasks(
  config?: Partial<KworkParserConfig>,
): Promise<KworkSearchResult> {
  const client = await getClient();
  if (!client) {
    return { tasks: [], total: 0, page: 1, hasMore: false };
  }

  try {
    const cats = config?.categories || [];
    const page = 1;

    const projects = await client.getProjects(cats, page);

    const tasks: KworkTask[] = (projects || [])
      .filter((p): p is KworkProject => !!p && !!p.id)
      .map(mapProjectToTask)
      .filter((t) => applyFilters(t, config));

    // Запрашиваем 2-ю страницу для hasMore
    let hasMore = tasks.length >= 20;
    if (!hasMore) {
      try {
        const page2 = await client.getProjects(cats, 2);
        if (page2 && page2.length > 0) hasMore = true;
      } catch {
        /* ignore */
      }
    }

    console.log(`[Kwork] Получено ${tasks.length} заказов`);
    return {
      tasks,
      total: tasks.length,
      page,
      hasMore,
    };
  } catch (err) {
    console.warn("[Kwork] ⚠️ Ошибка getAvailableTasks:", err instanceof Error ? err.message : String(err));
    return { tasks: [], total: 0, page: 1, hasMore: false };
  }
}

/** Получить детали одного заказа */
export async function getTaskDetails(taskId: string): Promise<KworkTask | null> {
  const client = await getClient();
  if (!client) return null;

  try {
    const projects = await client.getProjects([], 1);
    const found = (projects || []).find((p) => String(p.id) === taskId);
    return found ? mapProjectToTask(found) : null;
  } catch {
    return null;
  }
}

/** Откликнуться на заказ — пока не реализовано */
export async function placeBid(
  taskId: string,
  amount: string,
  message: string,
): Promise<KworkBid> {
  console.warn(`[Kwork] ⚠️ placeBid(${taskId}) — библиотека kwork-api не поддерживает отклики`);
  return {
    taskId,
    amount,
    message,
    submittedAt: Date.now(),
    status: "rejected",
    error: "В разработке",
  };
}

/** Отправить сообщение — пока не реализовано */
export async function sendMessage(_taskId: string, _content: string): Promise<void> {
  console.warn("[Kwork] ⚠️ sendMessage — в разработке");
}

/** Получить активные заказы (продавец) */
export async function getMyBids(): Promise<KworkBid[]> {
  const client = await getClient();
  if (!client) return [];

  try {
    const orders = (await client.getWorkerOrders()) as Record<string, unknown>[];
    return (orders || []).map((o) => ({
      taskId: String(o.id || ""),
      amount: String(o.amount || o.price || "0"),
      message: "",
      submittedAt: Date.now(),
      status: ((o.status === "in_progress" || o.status === "active") ? "accepted" : "pending") as "accepted" | "pending",
    }));
  } catch {
    return [];
  }
}

/** Поиск заказов */
export async function searchTasks(
  query: string,
  config?: Partial<KworkParserConfig>,
): Promise<KworkSearchResult> {
  return getAvailableTasks({
    ...config,
    keywords: [query, ...(config?.keywords || [])],
  });
}

// ═══════════════════════════════════════
//  Фильтры
// ═══════════════════════════════════════

function applyFilters(task: KworkTask, config?: Partial<KworkParserConfig>): boolean {
  if (!config) return true;

  const text = `${task.title} ${task.description}`.toLowerCase();

  // Ключевые слова (OR — достаточно одного совпадения)
  if (config.keywords?.length) {
    const match = config.keywords.some((kw) => text.includes(kw.toLowerCase()));
    if (!match) return false;
  }

  // Исключения
  if (config.excludeKeywords?.length) {
    const exclude = config.excludeKeywords.some((kw) => text.includes(kw.toLowerCase()));
    if (exclude) return false;
  }

  // Бюджет
  if (config.minBudget && task.budget && task.budget < config.minBudget) return false;
  if (config.maxBudget && task.budget && task.budget > config.maxBudget) return false;

  // Только верифицированные
  if (config.onlyVerified && !task.isVerified) return false;

  return true;
}

// ═══════════════════════════════════════
//  Маппинг
// ═══════════════════════════════════════

function mapProjectToTask(p: KworkProject): KworkTask {
  const now = Date.now();
  const pd = p as unknown as Record<string, unknown>;

  // Бюджет
  let budget: number | undefined;
  if (p.price) {
    const parsed = parseFloat(String(p.price));
    if (!isNaN(parsed)) budget = parsed;
  } else if (pd.price_from) {
    const from = parseFloat(String(pd.price_from));
    if (!isNaN(from)) budget = from;
  }

  const categoryName = p.category_name || p.category || "";

  // Дата создания
  let createdAt: number | undefined;
  if (p.created_at) {
    const ts = typeof p.created_at === "number" ? p.created_at : Date.parse(String(p.created_at));
    if (!isNaN(ts)) createdAt = ts;
  }

  return {
    id: String(p.id),
    title: p.name || p.title || "Без названия",
    description: p.description || (pd.text as string) || "",
    budget,
    currency: "RUB",
    categoryId: String(p.category_id || p.category || ""),
    categoryName,
    skills: [categoryName].filter(Boolean),
    url: `https://kwork.ru/projects/${p.id}/view`,
    createdAt: createdAt || now,
    updatedAt: now,
    status: "open",
    clientName: (pd.user_name as string) || undefined,
    clientRating: p.user_rating !== undefined ? Number(p.user_rating) : undefined,
    tags: p.tags || [],
    isVerified: !!p.is_verified,
    responsesCount: p.bids_count !== undefined ? Number(p.bids_count) : 0,
    viewsCount: p.views_count !== undefined ? Number(p.views_count) : 0,
  };
}
