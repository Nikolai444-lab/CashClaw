/**
 * matcher.ts — Движок подбора навыков под заказ
 *
 * Анализирует название, описание и бюджет заказа,
 * подбирает подходящие навыки из реестра.
 */

import type { SkillDefinition, SkillMatchResult } from "./types.js";
import { allSkills } from "./registry/index.js";

export const SKILL_REGISTRY = allSkills;

/** Псевдоним для внешнего экспорта */
export function listAllSkills() {
  return SKILL_REGISTRY.map((s) => ({
    id: s.id,
    name: s.name,
    keywords: s.keywords,
    instructionCount: s.instructions.length,
    needsBrowser: s.needsBrowser,
    dependencies: s.dependencies,
  }));
}

/**
 * Подобрать навыки под текст заказа.
 * @param title — название заказа
 * @param description — описание заказа
 * @returns массив подходящих навыков, отсортированных по релевантности
 */
export function matchSkills(
  title: string,
  description: string,
): SkillMatchResult {
  const text = `${title} ${description}`.toLowerCase();
  const matched: Array<{ skill: SkillDefinition; score: number; keywords: string[] }> = [];
  const allMatchedKeywords: string[] = [];

  for (const skill of SKILL_REGISTRY) {
    const matchedKeywords = skill.keywords.filter((kw) =>
      text.includes(kw.toLowerCase()),
    );

    if (matchedKeywords.length > 0) {
      const score = matchedKeywords.length / skill.keywords.length;
      matched.push({ skill, score, keywords: matchedKeywords });
      allMatchedKeywords.push(...matchedKeywords);
    }
  }

  // Сортируем по score (выше = лучше)
  matched.sort((a, b) => b.score - a.score);

  // Конфиденс: насколько хорошо мы подобрали
  // Если хотя бы один навык совпал на >20% слов — хорошо
  const confidence = matched.length > 0
    ? Math.min(1, Math.max(...matched.map((m) => m.score)) * 3)
    : 0;

  return {
    matched: matched.map((m) => m.skill),
    confidence,
    matchedKeywords: [...new Set(allMatchedKeywords)],
  };
}

/**
 * Сгенерировать секцию промпта для навыков.
 * @param skills — навыки, которые нужно описать в промпте
 * @returns текст для добавления в system prompt агента
 */
export function buildSkillsPrompt(skills: SkillDefinition[]): string {
  if (skills.length === 0) return "";

  const parts: string[] = [];
  parts.push("");

  for (const skill of skills) {
    parts.push(`## 🛠 Skill: ${skill.name}`);
    parts.push("");

    // Группируем по категориям
    const byCategory = new Map<string, typeof skill.instructions>();
    for (const inst of skill.instructions) {
      const category = inst.category;
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category)!.push(inst);
    }

    const categoryLabels: Record<string, string> = {
      setup: "Настройка",
      common: "Правила",
      testing: "Тестирование",
      deploy: "Деплой",
      security: "Безопасность",
      optimization: "Оптимизация",
    };

    for (const [cat, instructions] of byCategory) {
      const label = categoryLabels[cat] ?? cat;
      parts.push(`**${label}:**`);
      for (const inst of instructions) {
        parts.push(`- ${inst.text}`);
      }
      parts.push("");
    }
  }

  return parts.join("\n").trim();
}

/**
 * Собрать все зависимости для пакета навыков.
 */
export function collectDependencies(skills: SkillDefinition[]): string[] {
  const deps = new Set<string>();
  for (const skill of skills) {
    if (skill.dependencies) {
      for (const dep of skill.dependencies) {
        deps.add(dep);
      }
    }
  }
  return [...deps];
}

/**
 * Нужен ли браузер для этих навыков.
 */
export function needsBrowser(skills: SkillDefinition[]): boolean {
  return skills.some((s) => s.needsBrowser);
}
