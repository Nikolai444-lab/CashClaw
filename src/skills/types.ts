/**
 * types.ts — Типы для CashClaw Skill Registry
 *
 * Skill = набор инструкций + инструментов для конкретной технологии/стека.
 * Загружаются автоматически, когда агент берёт заказ подходящего профиля.
 */

export interface SkillDefinition {
  /** Уникальный ID навыка (например, "react", "python-api") */
  id: string;
  /** Человеческое название */
  name: string;
  /** Ключевые слова для авто-подбора по описанию заказа */
  keywords: string[];
  /** Версия формата навыка */
  version: number;
  /** Инструкции — что агенту нужно знать о работе с этим стеком */
  instructions: SkillInstruction[];
  /** Список npm зависимостей, которые нужно установить */
  dependencies?: string[];
  /** Команда для инициализации проекта (если применимо) */
  initCommand?: string;
  /** Cherry-pick: какие файловые инструменты нужны (по умолчанию все) */
  requiredTools?: string[];
  /** Флаг: навык требует браузер */
  needsBrowser?: boolean;
}

export interface SkillInstruction {
  /** Категория инструкции (setup, testing, deploy, common) */
  category: "setup" | "common" | "testing" | "deploy" | "security" | "optimization";
  /** Текст инструкции */
  text: string;
  /** Приоритет (выше = важнее) */
  priority?: number;
}

/**
 * Результат подбора навыков под заказ
 */
export interface SkillMatchResult {
  matched: SkillDefinition[];
  /** Оценка уверенности (0–1) */
  confidence: number;
  /** Какие ключевые слова совпали */
  matchedKeywords: string[];
}
