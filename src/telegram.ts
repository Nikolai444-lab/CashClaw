/**
 * telegram.ts — Telegram-уведомления для CashClaw
 *
 * Отправляет сообщения через Bot API.
 * Использует прямой TLS-сокет с явным IP и SNI для обхода DNS-блокировок.
 *
 * Используется:
 * 1. В heartbeat — уведомления о новых заказах
 * 2. Как инструмент агента — для связи с оператором
 */

import tls from "node:tls";
import net from "node:net";
import type { TelegramConfig } from "./config.js";

/** Базовая ссылка Bot API для отправки сообщений */
const API_HOST = "api.telegram.org";

/**
 * Рабочий IP для Telegram API (в обход DNS-блокировок).
 * 149.154.167.220 — проверенный рабочий IP для bot API.
 */
const API_IP = "149.154.167.220";

/** Порт HTTPS */
const API_PORT = 443;

/** Таймаут на соединение и чтение */
const TIMEOUT_MS = 30_000;

// ═══════════════════════════════════════
//  Отправка сообщений
// ═══════════════════════════════════════

interface TelegramResponse {
  ok: boolean;
  description?: string;
  result?: unknown;
}

/**
 * Отправить текстовое сообщение в Telegram.
 * Возвращает true, если отправка успешна.
 * Автоматически повторяет попытку при таймауте (до 3 раз).
 */
export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
  options?: { silent?: boolean; parseMode?: "HTML" | "Markdown" | "MarkdownV2" },
): Promise<boolean> {
  if (!config.botToken || !config.chatId) {
    console.warn("[Telegram] ❌ Не настроен: нет botToken или chatId");
    return false;
  }

  const MAX_RETRIES = 3;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const ok = await trySendViaTls(config, text, options);
      if (ok) return true;
      lastError = "unknown error";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        const delay = attempt === 1 ? 2000 : 4000;
        console.log(`[Telegram] ⏳ Повтор через ${delay}мс (попытка ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  console.warn(`[Telegram] ❌ Не удалось отправить после ${MAX_RETRIES} попыток: ${lastError}`);
  return false;
}

/**
 * Отправка запроса через TLS-сокет.
 * Если задан config.proxy (HTTP-прокси), сначала устанавливаем CONNECT-туннель
 * к api.telegram.org через прокси, затем поверх него TLS.
 * Иначе — прямой TLS-сокет к API_IP (в обход DNS-блокировок, но не SNI/подсети).
 */
function trySendViaTls(
  config: TelegramConfig,
  text: string,
  options?: { silent?: boolean; parseMode?: "HTML" | "Markdown" | "MarkdownV2" },
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const path = `/bot${config.botToken}/sendMessage`;

    const body = JSON.stringify({
      chat_id: config.chatId,
      text,
      parse_mode: options?.parseMode || undefined,
      disable_web_page_preview: true,
      disable_notification: options?.silent || undefined,
    });

    // Формируем raw HTTP-запрос
    const httpRequest = [
      `POST ${path} HTTP/1.1`,
      `Host: ${API_HOST}`,
      "Content-Type: application/json",
      `Content-Length: ${Buffer.byteLength(body)}`,
      "Connection: close",
      "",
      body,
    ].join("\r\n");

    let timedOut = false;
    let rawSocket: net.Socket | null = null;
    const timer = setTimeout(() => {
      timedOut = true;
      if (rawSocket) rawSocket.destroy();
      reject(new Error("Request timeout"));
    }, TIMEOUT_MS);

    let responseData = "";
    let socket: tls.TLSSocket | null = null;

    const attachTls = (tcpSocket: net.Socket) => {
      rawSocket = tcpSocket;
      socket = tls.connect(
        {
          socket: tcpSocket,
          servername: API_HOST,
          rejectUnauthorized: true,
        },
        () => {
          // TLS установлен — отправляем запрос
          socket!.write(httpRequest);
        },
      );

      socket.on("data", (chunk: Buffer) => {
        responseData += chunk.toString();
      });

      socket.on("end", () => {
        clearTimeout(timer);
        if (timedOut) return;

        const match = responseData.match(/\r\n\r\n(.*)/s);
        if (!match) {
          reject(new Error("No body in response"));
          return;
        }

        const bodyStr = match[1];
        try {
          const result = JSON.parse(bodyStr) as TelegramResponse;
          if (result.ok) {
            resolve(true);
          } else {
            console.warn(`[Telegram] ❌ Ошибка API: ${result.description || "unknown"}`);
            resolve(false);
          }
        } catch {
          reject(new Error(`Invalid JSON: ${bodyStr.substring(0, 100)}`));
        }
      });

      socket.on("error", (err: Error) => {
        clearTimeout(timer);
        if (!timedOut) reject(err);
      });
    };

    const proxy = config.proxy;
    if (proxy) {
      // HTTP CONNECT-туннель через прокси
      let proxyUrl: URL;
      try {
        proxyUrl = new URL(proxy);
      } catch {
        reject(new Error(`Invalid proxy URL: ${proxy}`));
        return;
      }
      const proxyHost = proxyUrl.hostname;
      const proxyPort = proxyUrl.port ? Number(proxyUrl.port) : 80;

      console.log(`[Telegram] 🌐 Использую HTTP-прокси ${proxyHost}:${proxyPort}`);
      const conn = net.connect(proxyPort, proxyHost);
      rawSocket = conn;

      conn.on("connect", () => {
        const connectReq = [
          `CONNECT ${API_HOST}:${API_PORT} HTTP/1.1`,
          `Host: ${API_HOST}:${API_PORT}`,
          "Proxy-Connection: keep-alive",
          "",
          "",
        ].join("\r\n");
        conn.write(connectReq);
      });

      let proxyBuf = "";
      conn.on("data", (chunk: Buffer) => {
        proxyBuf += chunk.toString();
        const headerEnd = proxyBuf.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;

        const header = proxyBuf.slice(0, headerEnd);
        const statusLine = header.split("\r\n")[0];
        const statusMatch = statusLine.match(/HTTP\/1\.[01]\s+(\d{3})/);
        if (!statusMatch) {
          conn.destroy();
          reject(new Error(`Bad proxy response: ${statusLine}`));
          return;
        }
        const code = Number(statusMatch[1]);
        if (code >= 200 && code < 300) {
          // Туннель установлен — снимаем слушатель raw data и включаем TLS поверх
          conn.removeAllListeners("data");
          attachTls(conn);
        } else {
          conn.destroy();
          reject(new Error(`Proxy CONNECT failed: ${code} ${statusLine}`));
        }
      });

      conn.on("error", (err: Error) => {
        clearTimeout(timer);
        if (!timedOut) reject(err);
      });
    } else {
      // Прямой TLS-сокет к API_IP
      const s = tls.connect(
        {
          host: API_IP,
          port: API_PORT,
          servername: API_HOST,
          rejectUnauthorized: true,
        },
        () => {
          s.write(httpRequest);
        },
      );
      rawSocket = s;
      socket = s;

      s.on("data", (chunk: Buffer) => {
        responseData += chunk.toString();
      });
      s.on("end", () => {
        clearTimeout(timer);
        if (timedOut) return;
        const match = responseData.match(/\r\n\r\n(.*)/s);
        if (!match) {
          reject(new Error("No body in response"));
          return;
        }
        const bodyStr = match[1];
        try {
          const result = JSON.parse(bodyStr) as TelegramResponse;
          if (result.ok) resolve(true);
          else {
            console.warn(`[Telegram] ❌ Ошибка API: ${result.description || "unknown"}`);
            resolve(false);
          }
        } catch {
          reject(new Error(`Invalid JSON: ${bodyStr.substring(0, 100)}`));
        }
      });
      s.on("error", (err: Error) => {
        clearTimeout(timer);
        if (!timedOut) reject(err);
      });
    }
  });
}

/**
 * Отправить сообщение о новом заказе с форматированием.
 */
/**
 * Экранировать спецсимволы HTML в тексте, чтобы не ломать parse_mode=HTML.
 * Telegram строгий — любой незакрытый < или > сломает парсинг.
 * Сначала удаляем любые потенциально битые HTML-подобные конструкции.
 */
function escapeHtml(text: string): string {
  // Удаляем всё, что похоже на HTML-теги (открывающие/закрывающие/незакрытые)
  // оставляем только безопасные символы
  let safe = text
    // Удаляем любые последовательности вида <...> чтобы не ломать парсер
    .replace(/<[^>]*>/g, "")
    // Удаляем одиночные < и > (незакрытые угловые скобки — частая причина ошибок)
    .replace(/</g, " ")
    .replace(/>/g, " ");
  // Экранируем & (на случай если был &lt; который стал просто lt)
  safe = safe.replace(/&/g, "&amp;");
  return safe;
}

/**
 * Обрезать описание до разумной длины, стараясь не разрывать слова
 */
function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > maxLen - 40 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

export function formatOrderNotification(
  title: string,
  description: string,
  budget: string,
  url: string,
  category?: string,
  analysis?: string,
): string {
  const lines: string[] = [];

  lines.push("📦 <b>Новый заказ!</b>");
  lines.push("");
  lines.push(`<b>${escapeHtml(title)}</b>`);
  lines.push("");

  if (budget) {
    lines.push(`💰 <b>Бюджет:</b> ${escapeHtml(budget)}`);
  }
  if (category) {
    lines.push(`🏷️ <b>Категория:</b> ${escapeHtml(category)}`);
  }

  const cleanDesc = description.replace(/\s+/g, " ").trim();
  if (cleanDesc) {
    const shortDesc = truncateText(escapeHtml(cleanDesc), 300);
    lines.push("");
    lines.push(shortDesc);
  }

  // Краткие выводы от LLM: см можем ли, срок, адекватная цена, конкуренция
  if (analysis) {
    lines.push("");
    lines.push("———");
    lines.push(escapeHtml(analysis.trim()));
  }

  lines.push("");
  lines.push(`🔗 ${url}`);

  return lines.join("\n");
}

/**
 * Проверить, нужно ли отправлять уведомление о заказе
 * (фильтрация по бюджету и ключевым словам)
 */
export function shouldNotifyAboutOrder(
  config: TelegramConfig,
  title: string,
  description: string,
  budgetRub?: number,
): boolean {
  if (config.minBudgetRub && budgetRub !== undefined && budgetRub > 0) {
    if (budgetRub < config.minBudgetRub) return false;
  }

  if (config.keywords && config.keywords.length > 0) {
    const text = `${title} ${description}`.toLowerCase();
    const match = config.keywords.some((kw) => text.includes(kw.toLowerCase()));
    if (!match) return false;
  }

  return true;
}

/**
 * Тест подключения к Telegram.
 */
export async function testTelegramConnection(config: TelegramConfig): Promise<string> {
  const testText = [
    "🤖 <b>CashClaw подключён к Telegram!</b>",
    "",
    "Уведомления о новых заказах будут приходить сюда.",
    "Версия: TLS-сокет с обходом DNS-блокировок",
  ].join("\n");

  const ok = await sendTelegramMessage(config, testText, { parseMode: "HTML" });
  if (ok) {
    return "✅ Telegram подключён — тестовое сообщение отправлено!";
  }
  return "❌ Не удалось отправить тестовое сообщение. Проверьте токен и chatId.";
}
