/**
 * FL.ru Marketplace Tools — инструменты для LLM
 * Аналог src/tools/marketplace.ts, но для FL.ru
 */

import type { Tool, ToolResult, ToolContext } from "../tools/types.js";
import * as fl from "../fl/cli.js";

// ═══════════════════════════════════════
//  Инструменты
// ═══════════════════════════════════════

export const browseProjects: Tool = {
  definition: {
    name: "browse_projects",
    description: "Просмотр доступных проектов на FL.ru (российская биржа фриланса)",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Максимум проектов (по умолч. 20)",
        },
        category: {
          type: "string",
          description: "Категория (saity, programmirovanie, dizajn, prodvizhenie-saitov-seo, reklama-marketing и т.д.)",
        },
      },
    },
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
    try {
      const result = await fl.getAvailableTasks({
        categories: args.category ? [args.category as string] : [],
      });

      const projects = result.tasks.slice(0, (args.limit as number) || 20);

      if (projects.length === 0) {
        return { success: true, data: "Нет доступных проектов на FL.ru" };
      }

      const lines = projects.map(
        (p) =>
          `#${p.id} | ${p.title} | ${p.budgetRaw || (p.budget ? `${p.budget} руб` : "Договорная")} | ${p.categoryName || "—"}`,
      );

      return {
        success: true,
        data: `Найдено проектов: ${result.total}\n\n${lines.join("\n")}`,
      };
    } catch (err) {
      return { success: false, data: `Ошибка: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};

export const readProject: Tool = {
  definition: {
    name: "read_project",
    description: "Читает детали одного проекта на FL.ru",
    input_schema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "ID проекта (число из ссылки)",
        },
      },
      required: ["projectId"],
    },
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
    try {
      const task = await fl.getTaskDetails(args.projectId as string);
      if (!task) {
        return { success: false, data: "Проект не найден" };
      }
      return {
        success: true,
        data: [
          `Проект #${task.id}`,
          `Название: ${task.title}`,
          `Бюджет: ${task.budgetRaw || (task.budget ? `${task.budget} руб` : "Договорная")}`,
          `Ссылка: ${task.url}`,
          ``,
          `Описание:`,
          task.description.slice(0, 1000),
        ].join("\n"),
      };
    } catch (err) {
      return { success: false, data: `Ошибка: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};

export const searchProjects: Tool = {
  definition: {
    name: "search_projects",
    description: "Поиск проектов на FL.ru по ключевым словам",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Поисковый запрос (например 'typescript react')",
        },
      },
      required: ["query"],
    },
  },
  execute: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
    try {
      const result = await fl.searchTasks(args.query as string);

      if (result.tasks.length === 0) {
        return { success: true, data: `По запросу "${args.query}" ничего не найдено` };
      }

      const lines = result.tasks.map(
        (p) =>
          `#${p.id} | ${p.title} | ${p.budgetRaw || (p.budget ? `${p.budget} руб` : "Договорная")}`,
      );

      return {
        success: true,
        data: `Поиск по "${args.query}": найдено ${result.total}\n\n${lines.join("\n")}`,
      };
    } catch (err) {
      return { success: false, data: `Ошибка: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};

export const flMarketplaceTools: Tool[] = [
  browseProjects,
  readProject,
  searchProjects,
];
