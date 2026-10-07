/**
 * skills.ts — Инструмент для управления навыками CashClaw
 *
 * Позволяет агенту:
 * - Подобрать навыки под заказ
 * - Посмотреть доступные навыки
 * - Активировать навыки для текущей задачи
 */

import type { Tool, ToolResult } from "./types.js";
import { matchSkills as matchSkillRegistry, SKILL_REGISTRY } from "../skills/matcher.js";

/**
 * match_skills — подобрать навыки под заказ
 */
export const matchSkills: Tool = {
  definition: {
    name: "match_skills",
    description:
      "Match available CashClaw skills to a freelancer task. " +
      "Pass the task title and description, and the system returns the best matching " +
      "technology skills (React, Python, WordPress, etc.) for executing the task.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Task title from the marketplace",
        },
        description: {
          type: "string",
          description: "Task description / requirements",
        },
      },
      required: ["title", "description"],
    },
  },
  async execute(input, _ctx): Promise<ToolResult> {
    const title = input.title as string;
    const description = input.description as string;

    if (!title && !description) {
      return { success: false, data: "Provide at least title or description" };
    }

    const result = matchSkillRegistry(title ?? "", description ?? "");

    if (result.matched.length === 0) {
      return {
        success: true,
        data: "No matching skills found for this task. Try describing the tech stack more specifically.",
      };
    }

    const lines = [
      `Matched ${result.matched.length} skill(s) (confidence: ${(result.confidence * 100).toFixed(0)}%):`,
      "",
    ];

    for (const skill of result.matched) {
      const matchedKeywords = result.matchedKeywords
        .filter((kw) => skill.keywords.includes(kw))
        .slice(0, 5);

      lines.push(`  🛠 **${skill.name}** (${skill.id})`);
      lines.push(`     ${skill.instructions.length} инструкций`);

      if (matchedKeywords.length > 0) {
        lines.push(`     🔑 совпало: "${matchedKeywords.join('", "')}"`);
      }

      if (skill.needsBrowser) {
        lines.push("     🌐 требуется браузер");
      }

      if (skill.dependencies && skill.dependencies.length > 0) {
        lines.push(`     📦 deps: ${skill.dependencies.join(", ")}`);
      }

      lines.push("");
    }

    lines.push(
      "Skills will be loaded into the agent prompt on the next task execution.",
    );

    return { success: true, data: lines.join("\n") };
  },
};

/**
 * list_skills — показать все доступные навыки
 */
export const listSkills: Tool = {
  definition: {
    name: "list_skills",
    description:
      "List all available CashClaw skills. Shows skill names, IDs, keywords, " +
      "and a brief description of what each skill provides.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  async execute(_input, _ctx): Promise<ToolResult> {
    const lines = [
      `📚 **CashClaw Skills (${SKILL_REGISTRY.length})**`,
      "",
    ];

    for (const skill of SKILL_REGISTRY) {
      const topKeywords = skill.keywords.slice(0, 4).join(", ");
      lines.push(
        `  **${skill.name}** (\`${skill.id}\`)`,
        `     ${skill.instructions.length} инструкций`,
        `     Ключевые слова: ${topKeywords}${skill.keywords.length > 4 ? "..." : ""}`,
        `     ${skill.needsBrowser ? "🌐 Требует браузер" : "💻 Только код"}`,
        "",
      );
    }

    lines.push("Используй `match_skills` чтобы подобрать навыки под заказ.");

    return { success: true, data: lines.join("\n") };
  },
};
