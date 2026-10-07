/**
 * tools/kwork-marketplace.ts — Инструменты для LLM для работы с Kwork
 * 
 * Аналог marketplace.ts из оригинального CashClaw, но для kwork.ru
 * 
 * ⚠️ Часть инструментов требует реализации парсинга в kwork/cli.ts
 *    Сейчас заглушки — они логируют вызов, но не делают реальных действий.
 */

import type { Tool } from "./types.js";
import * as kworkCli from "../kwork/cli.js";

function requireString(input: Record<string, unknown>, key: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val) throw new Error(`Missing required field: ${key}`);
  return val;
}

/**
 * Просмотр доступных заказов на Kwork
 * Аналог read_task, но получает список, а не один заказ
 */
export const browseProjects: Tool = {
  definition: {
    name: "browse_projects",
    description: "Browse available projects on the Kwork marketplace. Returns a list of open projects with titles, budgets, and descriptions.",
    input_schema: {
      type: "object",
      properties: {
        keywords: {
          type: "string",
          description: "Optional search keywords to filter projects (comma-separated)",
        },
        min_budget: {
          type: "number",
          description: "Minimum budget in RUB",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return (default 10)",
        },
      },
    },
  },
  async execute(input) {
    const config: Partial<import("../kwork/types.js").KworkParserConfig> = {
      keywords: (input.keywords as string)?.split(",").map(s => s.trim()).filter(Boolean) ?? [],
      minBudget: typeof input.min_budget === "number" ? input.min_budget : 0,
    };

    const result = await kworkCli.getAvailableTasks(config);
    return {
      success: true,
      data: JSON.stringify({
        total: result.total,
        tasks: result.tasks.slice(0, (input.max_results as number) ?? 10),
      }),
    };
  },
};

/**
 * Получить детали конкретного заказа
 */
export const readProject: Tool = {
  definition: {
    name: "read_project",
    description: "Get full details of a project from Kwork by its ID.",
    input_schema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "The Kwork project ID to read",
        },
      },
      required: ["project_id"],
    },
  },
  async execute(input) {
    const projectId = requireString(input, "project_id");
    const task = await kworkCli.getTaskDetails(projectId);
    return {
      success: true,
      data: task ? JSON.stringify(task) : `Project ${projectId} not found or inaccessible`,
    };
  },
};

/**
 * Откликнуться на заказ
 * Аналог quote_task из оригинального CashClaw
 */
export const placeBid: Tool = {
  definition: {
    name: "place_bid",
    description: "Place a bid on a Kwork project. You MUST have the full project details first. Provide your price and a message to the client.",
    input_schema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "The Kwork project ID",
        },
        amount: {
          type: "string",
          description: "Your price in RUB (e.g. '1500')",
        },
        message: {
          type: "string",
          description: "Your proposal message to the client",
        },
      },
      required: ["project_id", "amount", "message"],
    },
  },
  async execute(input) {
    const projectId = requireString(input, "project_id");
    const amount = requireString(input, "amount");
    const message = requireString(input, "message");
    const bid = await kworkCli.placeBid(projectId, amount, message);
    return {
      success: true,
      data: JSON.stringify(bid),
    };
  },
};

/**
 * Отправить сообщение заказчику
 * Аналог send_message из оригинального CashClaw
 */
export const contactClient: Tool = {
  definition: {
    name: "contact_client",
    description: "Send a message to the client on a project thread. Use for clarifications, questions, or updates.",
    input_schema: {
      type: "object",
      properties: {
        project_id: {
          type: "string",
          description: "The Kwork project ID",
        },
        content: {
          type: "string",
          description: "Your message content",
        },
      },
      required: ["project_id", "content"],
    },
  },
  async execute(input) {
    const projectId = requireString(input, "project_id");
    const content = requireString(input, "content");
    await kworkCli.sendMessage(projectId, content);
    return { success: true, data: `Message sent on project ${projectId}` };
  },
};

/**
 * Поиск заказов по тексту
 */
export const searchProjects: Tool = {
  definition: {
    name: "search_projects",
    description: "Search Kwork projects by text query. Returns matching projects.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query text",
        },
        max_results: {
          type: "number",
          description: "Maximum results (default 10)",
        },
      },
      required: ["query"],
    },
  },
  async execute(input) {
    const query = requireString(input, "query");
    const result = await kworkCli.searchTasks(query);
    return {
      success: true,
      data: JSON.stringify({
        total: result.total,
        tasks: result.tasks.slice(0, (input.max_results as number) ?? 10),
      }),
    };
  },
};
