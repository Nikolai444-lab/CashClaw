/**
 * browser.ts — Веб-браузер на базе Playwright
 *
 * Позволяет CashClaw открывать страницы, взаимодействовать
 * с элементами и делать скриншоты для проверки заказов/вёрстки.
 *
 * Использует единый экземпляр Chromium (lazy singleton), чтобы
 * не запускать браузер заново для каждого вызова.
 */

import { chromium, type Browser, type Page } from "playwright";

// ═══════════════════════════════════════
//  Singleton browser
// ═══════════════════════════════════════

let _browser: Browser | null = null;
let _page: Page | null = null;
let _refCount = 0;

/**
 * Получить (или создать) экземпляр браузера.
 * Автоматически создаёт новую страницу при первом вызове.
 */
async function getPage(): Promise<Page> {
  if (!_browser) {
    _browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

  }

  _refCount++;

  if (!_page || _page.isClosed()) {
    _page = await _browser.newPage();
    await _page.setViewportSize({ width: 1280, height: 800 });
  }

  return _page;
}

/**
 * Отметить, что страница больше не нужна.
 * Если нет активных пользователей, браузер закрывается через таймаут.
 */
async function releasePage(): Promise<void> {
  _refCount--;
  if (_refCount <= 0 && _browser) {
    try {
      await _browser.close();
    } catch {
      // игнорируем ошибки закрытия
    }
    _browser = null;
    _page = null;
    _refCount = 0;
  }
}

/**
 * Принудительно закрыть браузер (например, при перезагрузке конфига).
 */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    try {
      await _browser.close();
    } catch {
      // игнорируем
    }
    _browser = null;
    _page = null;
    _refCount = 0;
  }
}

// ═══════════════════════════════════════
//  Actions
// ═══════════════════════════════════════

export interface NavigationResult {
  url: string;
  title: string;
  status: number | null;
}

export async function navigate(url: string): Promise<NavigationResult> {
  const page = await getPage();

  // Добавляем https:// если не указан протокол
  const fullUrl = url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `https://${url}`;

  const response = await page.goto(fullUrl, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });

  return {
    url: page.url(),
    title: await page.title(),
    status: response?.status() ?? null,
  };
}

export interface SelectorResult {
  found: boolean;
  count: number;
  text?: string;
  html?: string;
}

export async function findElements(selector: string): Promise<SelectorResult> {
  const page = await getPage();
  const elements = await page.locator(selector).all();

  if (elements.length === 0) {
    return { found: false, count: 0 };
  }

  const first = elements[0];
  return {
    found: true,
    count: elements.length,
    text: (await first.textContent())?.trim().slice(0, 200) ?? undefined,
    html: (await first.innerHTML())?.slice(0, 500) ?? undefined,
  };
}

export async function click(selector: string): Promise<boolean> {
  try {
    const page = await getPage();
    await page.locator(selector).first().waitFor({ state: "visible", timeout: 10_000 });
    await page.locator(selector).first().click();
    return true;
  } catch {
    return false;
  }
}

export async function type(selector: string, text: string): Promise<boolean> {
  try {
    const page = await getPage();
    await page.locator(selector).first().waitFor({ state: "visible", timeout: 10_000 });
    await page.locator(selector).first().fill(text);
    return true;
  } catch {
    return false;
  }
}

export async function screenshot(): Promise<string> {
  const page = await getPage();
  const path = `/tmp/cashclaw_screenshot_${Date.now()}.png`;
  await page.screenshot({ path, fullPage: false });
  return path;
}

export async function getHtml(selector?: string): Promise<string> {
  const page = await getPage();

  if (selector) {
    try {
      const el = page.locator(selector).first();
      const html = await el.innerHTML({ timeout: 5_000 });
      return html.slice(0, 10_000);
    } catch {
      return `[Element "${selector}" not found]`;
    }
  }

  const html = await page.content();
  return html.slice(0, 10_000);
}

export async function getText(selector?: string): Promise<string> {
  const page = await getPage();

  if (selector) {
    try {
      const el = page.locator(selector).first();
      const text = await el.textContent({ timeout: 5_000 });
      return (text ?? "").trim().slice(0, 5_000);
    } catch {
      return `[Element "${selector}" not found]`;
    }
  }

  const text = await page.locator("body").textContent({ timeout: 5_000 });
  return (text ?? "").trim().slice(0, 5_000);
}

export async function evaluate<T>(script: string): Promise<T | string> {
  try {
    const page = await getPage();
    const result = await page.evaluate(script);
    return result as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error: ${msg}`;
  }
}

export async function waitFor(selector: string, timeoutMs = 10_000): Promise<boolean> {
  try {
    const page = await getPage();
    await page.locator(selector).first().waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}
