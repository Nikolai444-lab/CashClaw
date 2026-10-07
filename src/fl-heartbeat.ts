/**
 * FL.ru Heartbeat — мониторинг заказов с FL.ru
 *
 * Аналог src/heartbeat.ts, но без WebSocket.
 * Работает через HTTP-пуллинг с задержкой 5+ секунд.
 */

import type { LLMProvider } from "./llm/types.js";
import type { FlTask, FlParserConfig } from "./fl/types.js";
import type { TelegramConfig } from "./config.js";
import { getConfigDir } from "./config.js";
import fs from "node:fs";
import path from "node:path";
import * as fl from "./fl/cli.js";
import { appendLog } from "./memory/log.js";
import {
  sendTelegramMessage,
  formatOrderNotification,
  shouldNotifyAboutOrder,
} from "./telegram.js";

/**
 * Файл с ID уже виденных заказов.
 * Без него после каждого рестарта бот считает все заказы новыми
 * и повторно шлёт уведомления.
 */
const SEEN_IDS_FILE = () => path.join(getConfigDir(), "state", "fl_seen_ids.json");

function loadSeenIds(): Set<string> {
  const ids = new Set<string>();
  try {
    const file = SEEN_IDS_FILE();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(parsed)) {
        for (const id of parsed) ids.add(String(id));
        return ids;
      }
    }
  } catch {
    // битый файл — пересоберём из логов ниже
  }

  // Первый запуск без файла: восстанавливаем известные ID из логов,
  // чтобы не разослать старые заказы заново.
  try {
    const logsDir = path.join(getConfigDir(), "logs");
    if (fs.existsSync(logsDir)) {
      for (const file of fs.readdirSync(logsDir)) {
        if (!file.endsWith(".md")) continue;
        const text = fs.readFileSync(path.join(logsDir, file), "utf8");
        for (const match of text.matchAll(/Новый заказ #(\d+)/g)) ids.add(match[1]);
      }
    }
  } catch {
    // логи недоступны — работаем как раньше
  }
  return ids;
}

function saveSeenIds(ids: Set<string>): void {
  try {
    const file = SEEN_IDS_FILE();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify([...ids].slice(-500)));
  } catch {
    // не критично: в худшем случае после рестарта будут повторные уведомления
  }
}

/**
 * Бюджет для логов и уведомлений: диапазон показываем как «50 000 – 80 000 руб».
 */
function budgetText(task: FlTask): string {
  const { budgetMin, budgetMax, budget } = task;
  if (budgetMin !== undefined && budgetMax !== undefined && budgetMin !== budgetMax) {
    return `${budgetMin} – ${budgetMax} руб`;
  }
  const single = budgetMin ?? budget ?? budgetMax;
  if (single !== undefined) return `${single} руб`;
  return task.budgetRaw || "Договорная";
}

/** Значение бюджета для гейта Telegram-уведомлений */
function budgetForGate(task: FlTask): number | undefined {
  return task.budgetMin ?? task.budget ?? task.budgetMax;
}

/** Состояние heartbeat */
export interface FlHeartbeatState {
  running: boolean;
  activeProjects: Map<string, FlTask>;
  lastPoll: number;
  startedAt: number;
  totalPolls: number;
  errors: number;
  events: Array<{ type: string; taskId: string; title: string; at: number }>;
}

/** Интерефейс heartbeat (единый для всех marketplace) */
export interface FlHeartbeat {
  start(): void;
  stop(): void;
  readonly state: FlHeartbeatState;
}

/**
 * Создать heartbeat для FL.ru
 */
export function createFlHeartbeat(
  config: FlParserConfig & { agentId: string },
  _llm: LLMProvider,
  telegramConfig?: TelegramConfig,
): FlHeartbeat {
  const state: FlHeartbeatState = {
    running: false,
    activeProjects: new Map(),
    lastPoll: 0,
    startedAt: 0,
    totalPolls: 0,
    errors: 0,
    events: [],
  };

  let timer: ReturnType<typeof setInterval> | null = null;
  let knownIds = loadSeenIds();

  /** Рабочее время: с 8:00 до 20:00 по Москве */
  const WORK_START_HOUR = 8;
  const WORK_END_HOUR = 20;

  function isWorkTime(): boolean {
    const now = new Date();
    // Приводим к Europe/Moscow
    const mskHour = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" })).getHours();
    return mskHour >= WORK_START_HOUR && mskHour < WORK_END_HOUR;
  }

  async function tick(): Promise<void> {
    // Если нерабочее время — пропускаем опрос
    if (!isWorkTime()) {
      return;
    }

    try {
      const result = await fl.getAvailableTasks(config);

      state.totalPolls++;
      state.lastPoll = Date.now();

      // Находим новые проекты
      let addedNew = false;
      for (const task of result.tasks) {
        state.activeProjects.set(task.id, task);

        if (!knownIds.has(task.id)) {
          knownIds.add(task.id);
          addedNew = true;

          state.events.push({
            type: "new_project",
            taskId: task.id,
            title: task.title,
            at: Date.now(),
          });

          const budgetLabel = budgetText(task);

          appendLog(
            `[FL.ru] Новый заказ #${task.id}: "${task.title}" (${budgetLabel})`,
          );

          console.log(
            `[FL.ru] Новый заказ #${task.id}: "${task.title}" (${budgetLabel})`,
          );

          // Telegram-уведомление
          if (telegramConfig) {
            try {
              if (shouldNotifyAboutOrder(telegramConfig, task.title, task.description, budgetForGate(task))) {
                const budgetStr = budgetText(task);

                const msg = formatOrderNotification(
                  task.title,
                  task.description,
                  budgetStr,
                  task.url,
                  task.categoryName,
                );

                sendTelegramMessage(telegramConfig, msg, { parseMode: "HTML", silent: true })
                  .then((ok) => {
                    console.log(`[Telegram] Уведомление о #${task.id}: ${ok ? "✅ отправлено" : "❌ ошибка"}`);
                  })
                  .catch((e) => {
                    console.warn(`[Telegram] Ошибка отправки #${task.id}: ${e}`);
                  });
              }
            } catch (e) {
              console.warn(`[Telegram] Ошибка уведомления #${task.id}: ${e}`);
            }
          }
        }
      }

      // Ограничиваем историю событий
      if (state.events.length > 200) {
        state.events = state.events.slice(-100);
      }

      // Ограничиваем активные проекты
      if (state.activeProjects.size > 100) {
        const entries = [...state.activeProjects.entries()].slice(-100);
        state.activeProjects = new Map(entries);
      }

      // Обновляем knownIds (удаляем старые)
      if (knownIds.size > 500) {
        const ids = [...knownIds].slice(-300);
        knownIds = new Set(ids);
      }

      // Сохраняем виденные ID, чтобы рестарт не давал повторных уведомлений
      if (addedNew) {
        saveSeenIds(knownIds);
      }
    } catch (err) {
      state.errors++;
      console.warn(
        "[FL.ru] ⚠️ Ошибка heartbeat:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return {
    get state() {
      return state;
    },

    start(): void {
      if (state.running) return;
      state.running = true;
      state.startedAt = Date.now();

      appendLog("[FL.ru] Heartbeat started");
      console.log("[FL.ru] Heartbeat started");

      // Первый вызов сразу
      tick();
      timer = setInterval(tick, config.pollIntervalMs || 60_000);
    },

    stop(): void {
      state.running = false;
      state.events.push({
        type: "stopped",
        taskId: "",
        title: "Heartbeat stopped",
        at: Date.now(),
      });

      if (timer) {
        clearInterval(timer);
        timer = null;
      }

      appendLog("[FL.ru] Heartbeat stopped");
      console.log("[FL.ru] Heartbeat stopped");
    },
  };
}
