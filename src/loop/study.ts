import type { LLMProvider, LLMMessage } from "../llm/types.js";
import type { CashClawConfig } from "../config.js";
import { loadFeedback, type FeedbackEntry } from "../memory/feedback.js";
import {
  loadKnowledge,
  storeKnowledge,
  type KnowledgeEntry,
} from "../memory/knowledge.js";

export interface StudyResult {
  topic: KnowledgeEntry["topic"];
  insight: string;
  tokensUsed: number;
}

const STUDY_TOPICS: KnowledgeEntry["topic"][] = [
  "feedback_analysis",
  "specialty_research",
  "task_simulation",
];

const MAX_STUDY_TURNS = 3;

/** Pick the next topic by rotating through the list based on past entries */
function pickTopic(existing: KnowledgeEntry[], feedback: FeedbackEntry[]): KnowledgeEntry["topic"] {
  // Skip feedback_analysis if there's no feedback to analyze
  const eligible = feedback.length > 0
    ? STUDY_TOPICS
    : STUDY_TOPICS.filter((t) => t !== "feedback_analysis");

  const counts = new Map<string, number>();
  for (const topic of eligible) counts.set(topic, 0);
  for (const e of existing) {
    if (eligible.includes(e.topic)) {
      counts.set(e.topic, (counts.get(e.topic) ?? 0) + 1);
    }
  }

  let minTopic = eligible[0];
  let minCount = Infinity;
  for (const topic of eligible) {
    const count = counts.get(topic) ?? 0;
    if (count < minCount) {
      minCount = count;
      minTopic = topic;
    }
  }
  return minTopic;
}

function buildStudyPrompt(
  topic: KnowledgeEntry["topic"],
  config: CashClawConfig,
  feedback: FeedbackEntry[],
  knowledge: KnowledgeEntry[],
): string {
  const specialties = config.specialties.length > 0
    ? config.specialties.join(", ")
    : "general-purpose tasks";

  const recentFeedback = feedback.slice(-10);
  const feedbackSummary = recentFeedback.length > 0
    ? recentFeedback
        .map((f) => `- Score ${f.score}/5: "${f.taskDescription}" — ${f.comments || "no comment"}`)
        .join("\n")
    : "No feedback yet.";

  const existingKnowledge = knowledge.slice(-5)
    .map((k) => `- [${k.topic}] ${k.insight.slice(0, 150)}`)
    .join("\n") || "None yet.";

  const base = `Ты — самообучающийся автономный агент, специализирующийся на: ${specialties}.
Ты проводишь учебную сессию, чтобы улучшить свою будущую работу.

## Твои текущие знания
${existingKnowledge}

## Недавние отзывы клиентов
${feedbackSummary}
`;

  switch (topic) {
    case "feedback_analysis":
      return `${base}
## Задача: Анализ отзывов

Проанализируй приведённые выше отзывы. Какие паттерны прослеживаются? Какие типы задач получают высокие оценки, а какие — низкие? Какие конкретно улучшения можно внедрить?

Напиши краткое резюме (2-3 абзаца), которое поможет лучше работать в будущем. Фокус на практических выводах.`;

    case "specialty_research":
      return `${base}
## Задача: Исследование специализации

Как специалист в области ${specialties}, сформулируй:
1. Распространённые лучшие практики и стандарты качества
2. Частые ошибки и как их избегать
3. Паттерны, отличающие отличную работу от посредственной

Напиши краткое резюме (2-3 абзаца) с конкретными, применимыми на практике знаниями.`;

    case "task_simulation":
      return `${base}
## Задача: Практическая симуляция

Сгенерируй реалистичное задание, которое клиент мог бы дать по твоим специальностям (${specialties}). Затем составь план подхода — ключевые решения, проверки качества, структура результата.

Напиши краткое резюме (2-3 абзаца) с описанием подхода и извлечёнными уроками.`;
  }
}

function generateId(): string {
  return crypto.randomUUID();
}

export async function runStudySession(
  llm: LLMProvider,
  config: CashClawConfig,
): Promise<StudyResult> {
  const feedback = loadFeedback();
  const knowledge = loadKnowledge();
  const topic = pickTopic(knowledge, feedback);

  // Rotate through specialties instead of always using the first one
  const specialtyPool = config.specialties.length > 0 ? config.specialties : ["general"];
  const topicEntries = knowledge.filter((k) => k.topic === topic);
  const specialty = specialtyPool[topicEntries.length % specialtyPool.length];
  const prompt = buildStudyPrompt(topic, config, feedback, knowledge);

  const messages: LLMMessage[] = [
    { role: "user", content: prompt },
  ];

  let totalTokens = 0;
  let lastText = "";

  // Run up to MAX_STUDY_TURNS — no tools, pure reasoning
  for (let turn = 0; turn < MAX_STUDY_TURNS; turn++) {
    const response = await llm.chat(messages);
    totalTokens += response.usage.inputTokens + response.usage.outputTokens;

    const textBlocks = response.content.filter(
      (b): b is { type: "text"; text: string } => b.type === "text",
    );
    lastText = textBlocks.map((b) => b.text).join("\n");

    // Single turn is usually enough for study sessions
    if (response.stopReason === "end_turn") break;

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: "Continue your analysis. Focus on the most actionable insight.",
    });
  }

  const insight = lastText.trim() || "No insight produced.";

  // Determine what triggered this study
  const source = topic === "feedback_analysis" && feedback.length > 0
    ? `${feedback.length} feedback entries (avg ${(feedback.reduce((s, f) => s + f.score, 0) / feedback.length).toFixed(1)}/5)`
    : `scheduled ${topic} session`;

  const entry: KnowledgeEntry = {
    id: generateId(),
    topic,
    specialty,
    insight,
    source,
    timestamp: Date.now(),
  };

  storeKnowledge(entry);

  return { topic, insight, tokensUsed: totalTokens };
}
