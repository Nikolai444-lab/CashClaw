import type { SkillDefinition } from "../types.js";

/**
 * react — React / Next.js фронтенд
 */
const react: SkillDefinition = {
  id: "react",
  name: "React / Next.js Frontend",
  version: 1,
  keywords: [
    "react", "next.js", "nextjs", "frontend", "front-end", "front end",
    "ui", "интерфейс", "интерфейса", "веб-приложение", "веб приложение",
    "spa", "ssr", "landing", "лендинг", "лендиг", "сайт",
    "dashboard", "дашборд", "component", "компонент",
    "tailwind", "css", "scss", "sass", "styled-components",
    "redux", "zustand", "tanstack", "react-query",
    "typescript react", "tsx", "jsx",
  ],
  instructions: [
    {
      category: "setup",
      priority: 10,
      text:
        "Для React/Next.js используй Vite (create-vite) или create-next-app. " +
        "Не используй CRA (Create React App) — он deprecated.",
    },
    {
      category: "setup",
      text:
        "Если заказ на Next.js: предпочти App Router (app/), а не Pages Router (pages/)." +
        "Server Components по умолчанию, 'use client' только когда нужны хуки/события.",
    },
    {
      category: "common",
      priority: 9,
      text:
        "Структура React-проекта:\n" +
        "- src/components/ — переиспользуемые компоненты\n" +
        "- src/pages/ или src/app/ — страницы/роуты\n" +
        "- src/hooks/ — кастомные хуки\n" +
        "- src/lib/ — утилиты, API-клиенты\n" +
        "- src/types/ — TypeScript типы\n" +
        "- public/ — статика",
    },
    {
      category: "common",
      text:
        "TypeScript обязателен. Все компоненты типизированы. " +
        "Избегай 'any'. Используй интерфейсы для пропсов.",
    },
    {
      category: "common",
      text:
        "Адаптивная вёрстка: mobile-first подход. " +
        "Используй CSS Grid и Flexbox. Tailwind CSS если не указано иное.",
    },
    {
      category: "testing",
      text:
        "Тесты: Vitest + React Testing Library. " +
        "Тестируй поведение, а не реализацию.",
    },
    {
      category: "optimization",
      text:
        "Оптимизация: lazy load компонентов, image optimization через next/image, " +
        "code splitting по роутам.",
    },
  ],
  dependencies: ["react", "react-dom", "typescript", "@types/react"],
  needsBrowser: true,
};

/**
 * react — TypeScript / Node.js бэкенд
 */
const typescriptBackend: SkillDefinition = {
  id: "typescript-backend",
  name: "TypeScript / Node.js Backend",
  version: 1,
  keywords: [
    "typescript", "node.js", "nodejs", "backend", "back-end", "back end",
    "api", "rest api", "restapi", "graphql",
    "сервер", "серверный", "бэкенд",
    "express", "nestjs", "nest.js", "hono", "fastify",
    "websocket", "socket.io", "web socket",
    "microservice", "микросервис",
    "telegram bot", "телеграм бот", "tg bot",
    "discord bot", "slack bot",
  ],
  instructions: [
    {
      category: "setup",
      priority: 10,
      text:
        "Используй Express (для REST) или Hono (лёгкий, быстрый). " +
        "NestJS для крупных проектов. Всегда TypeScript.",
    },
    {
      category: "common",
      priority: 9,
      text:
        "Структура TypeScript-бэкенда:\n" +
        "- src/routes/ или src/controllers/ — роуты\n" +
        "- src/services/ — бизнес-логика\n" +
        "- src/middleware/ — middleware\n" +
        "- src/models/ — модели данных\n" +
        "- src/utils/ — утилиты\n" +
        "- src/config/ — конфигурация\n" +
        "- prisma/ или src/db/ — схемы БД",
    },
    {
      category: "common",
      text:
        "Валидация: Zod для схем входящих данных. " +
        "Prisma или Drizzle для ORM. Избегай raw SQL без необходимости.",
    },
    {
      category: "security",
      priority: 8,
      text:
        "Безопасность: helmet, rate limiting, CORS настроен строго. " +
        "Пароли хешировать (bcrypt/argon2). JWT с ограниченным сроком. " +
        "Никаких секретов в коде — переменные окружения.",
    },
    {
      category: "common",
      text:
        "Обработка ошибок: централизованный error handler. " +
        "Всегда возвращай consistent JSON: { error: string, details?: unknown }.",
    },
    {
      category: "testing",
      text:
        "Тесты: Vitest для unit-тестов, Supertest для интеграционных. " +
        "Тестируй сервисы и роуты.",
    },
    {
      category: "optimization",
      text:
        "Кэширование: Redis для частых запросов. " +
        "Пагинация для списковых эндпоинтов.",
    },
  ],
  dependencies: ["typescript", "@types/node", "zod"],
  needsBrowser: false,
};

/**
 * python — Python бэкенд / data / ML
 */
const python: SkillDefinition = {
  id: "python",
  name: "Python (Backend / Data / ML)",
  version: 1,
  keywords: [
    "python", "django", "fastapi", "flask",
    "питон", "питоне", "пайтон",
    "парсинг", "scraping", "scraper", "скрапинг",
    "ml", "machine learning", "машинное обучение", "нейросеть",
    "data science", "data analysis", "анализ данных",
    "telegram bot python", "aiogram",
    "sqlalchemy", "alembic",
    "jupyter", "pandas", "numpy",
  ],
  instructions: [
    {
      category: "setup",
      priority: 10,
      text:
        "Используй Python 3.11+. Poetry для управления зависимостями. " +
        "FastAPI для REST API (современнее Flask). Django для крупных проектов.",
    },
    {
      category: "common",
      priority: 9,
      text:
        "Структура Python-проекта:\n" +
        "- src/ или project_name/ — основной код\n" +
        "- tests/ — тесты\n" +
        "- pyproject.toml — зависимости и метаданные\n" +
        "- Dockerfile — если нужен деплой",
    },
    {
      category: "common",
      text:
        "Типизация: используй type hints везде. mypy для проверки. " +
        "Pydantic для валидации данных (особенно в FastAPI).",
    },
    {
      category: "common",
      text:
        "Для ботов: aiogram 3.x (Telegram), discord.py (Discord). " +
        "Асинхронный код (asyncio) — стандарт.",
    },
    {
      category: "common",
      text:
        "Для парсинга: httpx (асинхронный клиент). playwright/python для JS-рендеринга. " +
        "BeautifulSoup4 или parsel для HTML.",
    },
    {
      category: "testing",
      text:
        "Тесты: pytest. pytest-asyncio для async кода. " +
        "Минимум 80% покрытия ключевых модулей.",
    },
    {
      category: "security",
      text:
        "Безопасность: env-файлы для секретов (python-dotenv). " +
        "Никаких паролей/токенов в коде. SQL-инъекции — через ORM.",
    },
  ],
  dependencies: ["pydantic", "python-dotenv"],
  needsBrowser: true, // может понадобиться для парсинга
};

/**
 * wordpress — WordPress / PHP
 */
const wordpress: SkillDefinition = {
  id: "wordpress",
  name: "WordPress / PHP",
  version: 1,
  keywords: [
    "wordpress", "wp", "вордпресс", "wordpress",
    "php", "пхп",
    "woocommerce", "elementor", "acf",
    "тема wordpress", "wordpress тема", "wordpress theme", "wp theme",
    "плагин wordpress", "wp plugin", "wordpress plugin",
    "доработка wordpress", "настройка wordpress",
  ],
  instructions: [
    {
      category: "setup",
      priority: 10,
      text:
        "WordPress — оцени возможность использования готовых решений " +
        "(ACF, Elementor, WooCommerce), прежде чем писать кастомный код. " +
        "PHP 8.x обязательно.",
    },
    {
      category: "common",
      text:
        "Для кастомной темы: используй базовый Starter Theme (underscores или Sage). " +
        "ACF для произвольных полей — стандарт индустрии.",
    },
    {
      category: "common",
      text:
        "Безопасность: экранируй вывод (esc_html, esc_attr), " +
        "валидируй и санитайзируй ввод. Prepared statements для SQL.",
    },
    {
      category: "common",
      text:
        "Используй WP REST API для интеграций. " +
        "Для Vue/React фронтенда — headless WordPress через WP REST API.",
    },
    {
      category: "optimization",
      text:
        "Оптимизация: кэширование (WP Super Cache / W3 Total Cache), " +
        "минификация CSS/JS, оптимизация изображений (WebP).",
    },
  ],
  dependencies: [],
  needsBrowser: true,
};

/**
 * figma — Вёрстка из Figma / PSD
 */
const figmaToHtml: SkillDefinition = {
  id: "figma-to-html",
  name: "Вёрстка из Figma / PSD / макетов",
  version: 1,
  keywords: [
    "figma", "фигма", "psd", "photoshop",
    "вёрстка", "верстка", "layout", "макет",
    "html", "html/css", "html css", "css",
    "адаптивная вёрстка", "responsive", "адаптив",
    "bootstrap", "tailwind", "pixel perfect",
    "лэндинг", "landing page", "страница",
    "email шаблон", "email template", "письмо",
  ],
  instructions: [
    {
      category: "common",
      priority: 9,
      text:
        "Pixel perfect вёрстка по макету. Браузер: Chrome последний, " +
        "Firefox для кросс-браузерной проверки.",
    },
    {
      category: "common",
      text:
        "Mobile-first адаптив. Breakpoints: 320px, 768px, 1024px, 1440px. " +
        "Все состояния: hover, focus, active, disabled.",
    },
    {
      category: "common",
      text:
        "Оптимизация: изображения WebP (с fallback на PNG/JPEG), " +
        "Lazy load для изображений ниже сгиба. Конвертируй шрифты в woff2.",
    },
    {
      category: "common",
      text:
        "Семантический HTML: header, nav, main, section, article, footer. " +
        "ARIA-атрибуты для доступности. Проверка через Lighthouse.",
    },
    {
      category: "common",
      text:
        "Tailwind CSS по умолчанию (если не указано иное). " +
        "Для email вёрстки — табличная вёрстка, inline стили, " +
        "проверка в Email on Acid / Litmus.",
    },
    {
      category: "testing",
      text:
        "Проверка: браузеры Chrome, Firefox, Safari, Edge. " +
        "Мобильные: iOS Safari, Android Chrome. Lighthouse > 90.",
    },
  ],
  dependencies: [],
  needsBrowser: true,
};

/**
 * telegram-bot — Telegram боты
 */
const telegramBot: SkillDefinition = {
  id: "telegram-bot",
  name: "Telegram Bot Development",
  version: 1,
  keywords: [
    "telegram bot", "телеграм бот", "tg bot", "бот телеграм",
    "aiogram", "python-telegram-bot", "telegraf",
    "telegram api", "bot api",
    "telegram mini app", "tma", "mini app",
    "telegram web app", "telegram webapp",
  ],
  instructions: [
    {
      category: "setup",
      priority: 10,
      text:
        "Python: aiogram 3.x (рекомендуется, асинхронный). " +
        "TypeScript: Telegraf или grammY. " +
        "Для Mini Apps — используй @tma.js/sdk на фронтенде.",
    },
    {
      category: "common",
      text:
        "Структура бота:\n" +
        "- handlers/ — обработчики команд и callback'ов\n" +
        "- keyboards/ — inline и reply клавиатуры\n" +
        "- middlewares/ — middleware (логирование, доступ)\n" +
        "- utils/ — утилиты, форматирование\n" +
        "- db/ — работа с БД (SQLite для простых, PostgreSQL для серьёзных)",
    },
    {
      category: "common",
      text:
        "FMS (Finit State Machine) через aiogram's FSM или grammY session. " +
        "Для Long polling используй webhook в продакшене.",
    },
    {
      category: "security",
      text:
        "Безопасность: проверяй, что update пришёл от Telegram (secret token для webhook). " +
        "Никаких токенов в коде. Rate limiting на команды пользователей.",
    },
    {
      category: "common",
      text:
        "Для Mini Apps: Telegram WebApp initData validation обязательна. " +
        "HMAC-SHA256 проверка через bot token.",
    },
  ],
  dependencies: [],
  needsBrowser: true, // для Mini Apps
};

export const allSkills: SkillDefinition[] = [
  react,
  typescriptBackend,
  python,
  wordpress,
  figmaToHtml,
  telegramBot,
];
