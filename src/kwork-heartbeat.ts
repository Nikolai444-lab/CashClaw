/**
 * kwork-heartbeat.ts — Heartbeat для Kwork
 * 
 * Аналог оригинального heartbeat.ts, но:
 * - Вместо WebSocket к Moltlaunch — HTTP polling к Kwork
 * - Вместо onchain-задач — обычные заказы с биржи
 * - Вместо кошелька ETH — бюджет в рублях
 * 
 * ⚠️ ЗАГЛУШКА — требует реализации парсинга в kwork/cli.ts
 *    Сейчас heartbeat тикает, логирует, но не получает реальных заказов.
 */

import type { CashClawConfig } from "./config.js";
import type { LLMProvider } from "./llm/types.js";
import type { KworkTask } from "./kwork/types.js";
import * as kworkCli from "./kwork/cli.js";
import { runAgentLoop } from "./loop/index.js";
import { runStudySession } from "./loop/study.js";
import { appendLog } from "./memory/log.js";

/** Статусы, при которых задача считается завершённой */
const TERMINAL_STATUSES = new Set(["completed", "canceled"]);

export interface KworkHeartbeatState {
  running: boolean;
  /** Текущие активные заказы, за которые взялся агент */
  activeProjects: Map<string, KworkTask>;
  /** ID заказов, которые мы уже видели (чтобы не дублировать) */
  seenProjectIds: Set<string>;
  lastPoll: number;
  totalPolls: number;
  startedAt: number;
  events: KworkActivityEvent[];
  lastStudyTime: number;
  totalStudySessions: number;
  /** Счётчик откликов за сегодня */
  todayBids: number;
  /** Дата последнего сброса счётчика */
  lastBidResetDay: number;
}

export interface KworkActivityEvent {
  timestamp: number;
  type: "poll" | "new_project" | "bid_placed" | "bid_accepted" | "work_submitted" | "error" | "study";
  projectId?: string;
  message: string;
}

export function createKworkHeartbeat(
  config: CashClawConfig,
  llm: LLMProvider,
) {
  const state: KworkHeartbeatState = {
    running: false,
    activeProjects: new Map(),
    seenProjectIds: new Set(),
    lastPoll: 0,
    totalPolls: 0,
    startedAt: 0,
    events: [],
    lastStudyTime: 0,
    totalStudySessions: 0,
    todayBids: 0,
    lastBidResetDay: new Date().getDate(),
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const processing = new Set<string>();

  function emit(event: Omit<KworkActivityEvent, "timestamp">) {
    const full: KworkActivityEvent = { ...event, timestamp: Date.now() };
    state.events.push(full);
    if (state.events.length > 200) {
      state.events = state.events.slice(-200);
    }
  }

  /**
   * Основной тик — опрос Kwork
   * 
   * TODO: Когда kwork/cli.ts будет реализован:
   * 1. Звать kworkCli.getAvailableTasks()
   * 2. Фильтровать по ключевым словам/бюджету
   * 3. Новые заказы — запускать agent loop для оценки
   * 4. Если autoQuote включён — placeBid
   */
  async function tick() {
    // Сброс дневного счётчика откликов
    const today = new Date().getDate();
    if (today !== state.lastBidResetDay) {
      state.todayBids = 0;
      state.lastBidResetDay = today;
    }

    try {
      const result = await kworkCli.getAvailableTasks({
        keywords: config.specialties,
        pollIntervalMs: config.polling.intervalMs,
        mode: config.autoQuote ? "auto-reply" : "monitor",
      });

      state.lastPoll = Date.now();
      state.totalPolls++;

      emit({
        type: "poll",
        message: `Kwork poll: ${result.tasks.length} project(s) available`,
      });

      for (const task of result.tasks) {
        // Пропускаем уже виденные
        if (state.seenProjectIds.has(task.id)) continue;
        state.seenProjectIds.add(task.id);

        // Пропускаем, если уже в работе или в обработке
        if (state.activeProjects.has(task.id)) continue;
        if (processing.has(task.id)) continue;

        // Пропускаем завершённые
        if (TERMINAL_STATUSES.has(task.status)) continue;

        emit({
          type: "new_project",
          projectId: task.id,
          message: `New project: "${task.title}" — ${task.budget} RUB`,
        });

        // Если включён авторежим — запускаем agent loop
        if (config.autoQuote && config.autoWork) {
          if (processing.size >= config.maxConcurrentTasks) break;

          state.activeProjects.set(task.id, task);
          processing.add(task.id);

          emit({
            type: "bid_placed",
            projectId: task.id,
            message: `Evaluating project ${task.id} for bidding`,
          });
          appendLog(`[Kwork] Evaluating project ${task.id}: "${task.title}"`);

          // TODO: запускать runAgentLoop, когда будет полная интеграция
          // Сейчас просто логируем
          appendLog(`[Kwork] Project ${task.id} evaluated — pending integration`);

          processing.delete(task.id);
        } else {
          // В режиме мониторинга — просто логируем
          appendLog(`[Kwork] New project seen: "${task.title}" (${task.budget} RUB) — monitoring mode`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: "error", message: `Kwork poll error: ${msg}` });
      appendLog(`[Kwork] Poll error: ${msg}`);
    }

    scheduleNext();
  }

  let studying = false;

  async function maybeStudy() {
    if (!config.learningEnabled) return;
    if (studying) return;
    if (processing.size > 0) return;

    if (Date.now() - state.lastStudyTime < config.studyIntervalMs) return;

    studying = true;
    emit({ type: "study", message: "Starting study session..." });
    appendLog("[Kwork] Study session started");

    try {
      const result = await runStudySession(llm, config);
      state.lastStudyTime = Date.now();
      state.totalStudySessions++;

      emit({
        type: "study",
        message: `Study complete: ${result.topic} (${result.tokensUsed} tokens)`,
      });
      appendLog(`[Kwork] Study complete: ${result.topic}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: "error", message: `Study error: ${msg}` });
      appendLog(`[Kwork] Study error: ${msg}`);
      state.lastStudyTime = Date.now();
    } finally {
      studying = false;
    }
  }

  function scheduleNext() {
    if (!state.running) return;

    void maybeStudy();

    const interval = config.polling.intervalMs;
    timer = setTimeout(() => void tick(), interval);
  }

  function start() {
    if (state.running) return;
    state.running = true;
    state.startedAt = Date.now();
    if (state.lastStudyTime === 0) {
      state.lastStudyTime = Date.now();
    }
    appendLog("[Kwork] Heartbeat started");
    void tick();
  }

  function stop() {
    state.running = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    appendLog("[Kwork] Heartbeat stopped");
  }

  return { state, start, stop };
}

export type KworkHeartbeat = ReturnType<typeof createKworkHeartbeat>;
