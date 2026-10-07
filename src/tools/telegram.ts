/**
 * telegram.ts — Telegram-инструменты для CashClaw
 *
 * Позволяют агенту отправлять сообщения оператору через Telegram.
 * Использует конфигурацию TelegramConfig из config.ts.
 */

import type { Tool, ToolResult } from "./types.js";
import { sendTelegramMessage } from "../telegram.js";

/**
 * send_telegram — отправка сообщения оператору
 */
export const sendTelegram: Tool = {
  definition: {
    name: "send_telegram",
    description:
      "Send a Telegram message to the operator (Николай). " +
      "Use when: task is completed and needs review, a question needs operator input, " +
      "a problem requires human intervention, or progress update is important.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Message text to send. Keep it clear and concise.",
        },
        priority: {
          type: "string",
          enum: ["normal", "urgent"],
          description:
            "'urgent' sends with sound/vibration, 'normal' is silent. Default: normal.",
        },
      },
      required: ["text"],
    },
  },
  async execute(input, ctx): Promise<ToolResult> {
    const text = input.text as string;
    if (!text || typeof text !== "string") {
      return { success: false, data: "Missing required field: text" };
    }

    const tgConfig = ctx.config.telegram;
    if (!tgConfig || !tgConfig.botToken || !tgConfig.chatId) {
      return {
        success: false,
        data: "Telegram is not configured. Set botToken and chatId in config.",
      };
    }

    const priority = input.priority as string | undefined;
    const silent = priority !== "urgent";

    const ok = await sendTelegramMessage(tgConfig, text, {
      silent,
      parseMode: "HTML",
    });

    if (ok) {
      return {
        success: true,
        data: `Message sent to Telegram ${silent ? "(silent)" : "(urgent 🚨)"}: ${text.slice(0, 100)}`,
      };
    }

    return { success: false, data: "Failed to send Telegram message" };
  },
};
