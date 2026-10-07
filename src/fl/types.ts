/**
 * Типы данных для FL.ru
 */

/**
 * Заказ с FL.ru — формат для Agent Loop
 */
export interface FlTask {
  id: string;
  title: string;
  description: string;
  /** Бюджет в рублях (если указан): нижняя граница диапазона, иначе единственное число */
  budget?: number;
  /** Нижняя граница бюджета для диапазона («50 000 – 80 000» → 50000) */
  budgetMin?: number;
  /** Верхняя граница бюджета для диапазона («50 000 – 80 000» → 80000) */
  budgetMax?: number;
  /** Бюджет как строка ("Договорная", "от 10 000 руб" и т.д.) */
  budgetRaw?: string;
  currency: "RUB";
  /** ID категории FL.ru */
  categoryId: string;
  /** Название категории */
  categoryName: string;
  /** URL заказа */
  url: string;
  /** Дата публикации timestamp */
  createdAt: number;
  updatedAt: number;
  status: string;
  /** Имя заказчика */
  clientName?: string;
  /** Количество просмотров */
  views: number;
  /** Количество откликов */
  responsesCount: number;
  /** Есть ли файлы в задании */
  hasFiles: boolean;
  /** Город (если указан) */
  city?: string;
}

/**
 * Результат поиска заказов
 */
export interface FlSearchResult {
  tasks: FlTask[];
  total: number;
  page: number;
  hasMore: boolean;
}

/**
 * Конфигурация для парсера FL.ru
 */
export interface FlParserConfig {
  /** Категории для отслеживания (пустой список — все) */
  categories: string[];
  /** Минимальный бюджет */
  minBudget: number;
  /** Максимальный бюджет (0 — без ограничения) */
  maxBudget: number;
  /** Ключевые слова для фильтрации */
  keywords: string[];
  /** Ключевые слова-исключения */
  excludeKeywords: string[];
  /** Интервал опроса в мс */
  pollIntervalMs: number;
}
