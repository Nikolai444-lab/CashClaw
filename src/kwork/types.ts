/**
 * Типы данных для Kwork (kwork.ru)
 */

/**
 * Сырой проект из ответа kwork-api (getProjects)
 * Поля соответствуют реальным данным от api.kwork.ru
 */
export interface KworkProject {
  id: number;
  name: string;
  title?: string;
  description?: string;
  text?: string;
  price?: number | string;
  price_from?: number | string;
  price_to?: number | string;
  category?: string;
  category_id?: number;
  category_name?: string;
  user_name?: string;
  user_rating?: number;
  is_verified?: boolean;
  bids_count?: number | string;
  views_count?: number | string;
  created_at?: number | string;
  tags?: string[];
  status?: string;
}

/**
 * Заказ (KworkTask) — формат для Agent Loop
 */
export interface KworkTask {
  id: string;
  title: string;
  description: string;
  /** Бюджет в рублях (если указан) */
  budget?: number;
  currency: "RUB";
  categoryId: string;
  categoryName: string;
  /** Навыки (извлекаются из категории) */
  skills: string[];
  url: string;
  createdAt: number;
  updatedAt: number;
  status: string;
  clientName?: string;
  clientRating?: number;
  tags: string[];
  isVerified: boolean;
  responsesCount: number;
  viewsCount: number;
}

/**
 * Результат поиска заказов
 */
export interface KworkSearchResult {
  tasks: KworkTask[];
  total: number;
  page: number;
  hasMore: boolean;
}

/**
 * Отклик на заказ
 */
export interface KworkBid {
  taskId: string;
  amount: string;
  message: string;
  submittedAt: number;
  status: "pending" | "accepted" | "declined" | "rejected";
  error?: string;
}

/**
 * Конфигурация для парсера Kwork
 */
export interface KworkParserConfig {
  /** Категории для отслеживания (ID категорий или пусто — все) */
  categories: number[];
  /** Минимальный бюджет (0 — без ограничения) */
  minBudget: number;
  /** Максимальный бюджет (0 — без ограничения) */
  maxBudget: number;
  /** Только проверенные заказы */
  onlyVerified: boolean;
  /** Ключевые слова для фильтрации */
  keywords: string[];
  /** Ключевые слова-исключения */
  excludeKeywords: string[];
  /** Интервал опроса в мс */
  pollIntervalMs: number;
  /** Режим работы */
  mode: "monitor" | "auto-reply";
  /** Максимум откликов в день */
  maxBidsPerDay: number;
}

/**
 * Данные для авторизации в Kwork API
 */
export interface KworkAuth {
  login: string;
  password: string;
  phone: string;
  /** Опциональный SOCKS-прокси (socks5://... / socks4://...) */
  proxy?: string;
}
