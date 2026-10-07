/**
 * browser.ts — Инструменты веб-браузера для CashClaw
 *
 * Регистрируются как инструменты агента, чтобы CashClaw мог:
 * - Проверять страницы заказчиков
 * - Тестировать вёрстку
 * - Искать информацию
 * - Выполнять простую веб-автоматизацию
 */

import type { Tool, ToolResult } from "./types.js";
import {
  navigate,
  click,
  type,
  screenshot,
  getHtml,
  getText,
  evaluate,
  findElements,
  waitFor,
} from "../browser.js";

/**
 * browser_navigate — открыть URL
 */
export const browserNavigate: Tool = {
  definition: {
    name: "browser_navigate",
    description:
      "Open a URL in the browser. Navigates to the page and waits for it to load. " +
      "Use this to check a client's website, visit a project page, or start a web automation flow.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to navigate to. HTTP/HTTPS is added automatically if missing.",
        },
      },
      required: ["url"],
    },
  },
  async execute(input, _ctx): Promise<ToolResult> {
    const url = input.url as string;
    if (!url) return { success: false, data: "Missing required field: url" };

    try {
      const result = await navigate(url);
      return {
        success: true,
        data: `Navigated to: ${result.url}\nTitle: ${result.title}\nStatus: ${result.status}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, data: `Navigation failed: ${msg}` };
    }
  },
};

/**
 * browser_click — кликнуть по элементу
 */
export const browserClick: Tool = {
  definition: {
    name: "browser_click",
    description:
      "Click on an element on the page by CSS selector. " +
      "Useful for clicking buttons, links, tabs, or any interactive element.",
    input_schema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector of the element to click (e.g., 'button.submit', '#login-btn', 'a[href=\"/contact\"]')",
        },
      },
      required: ["selector"],
    },
  },
  async execute(input, _ctx): Promise<ToolResult> {
    const selector = input.selector as string;
    if (!selector) return { success: false, data: "Missing required field: selector" };

    try {
      const ok = await click(selector);
      return ok
        ? { success: true, data: `Clicked "${selector}" ✅` }
        : { success: false, data: `Could not click "${selector}" — element not found or not visible` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, data: `Click failed: ${msg}` };
    }
  },
};

/**
 * browser_type — ввести текст в поле
 */
export const browserType: Tool = {
  definition: {
    name: "browser_type",
    description:
      "Type text into an input field on the page. " +
      "Finds the element by CSS selector and fills it with the specified text.",
    input_schema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector of the input field (e.g., 'input[name=\"email\"]', '#search-box')",
        },
        text: {
          type: "string",
          description: "Text to type into the field",
        },
      },
      required: ["selector", "text"],
    },
  },
  async execute(input, _ctx): Promise<ToolResult> {
    const selector = input.selector as string;
    const text = input.text as string;
    if (!selector) return { success: false, data: "Missing required field: selector" };
    if (!text) return { success: false, data: "Missing required field: text" };

    try {
      const ok = await type(selector, text);
      return ok
        ? { success: true, data: `Typed "${text.slice(0, 50)}${text.length > 50 ? "…" : ""}" into "${selector}" ✅` }
        : { success: false, data: `Could not find field "${selector}"` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, data: `Type failed: ${msg}` };
    }
  },
};

/**
 * browser_screenshot — сделать скриншот
 */
export const browserScreenshot: Tool = {
  definition: {
    name: "browser_screenshot",
    description:
      "Take a screenshot of the current page. Returns the file path. " +
      "Use this to see what the page looks like visually.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  async execute(_input, _ctx): Promise<ToolResult> {
    try {
      const path = await screenshot();
      return {
        success: true,
        data: `Screenshot saved to: ${path}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, data: `Screenshot failed: ${msg}` };
    }
  },
};

/**
 * browser_html — получить HTML страницы
 */
export const browserHtml: Tool = {
  definition: {
    name: "browser_html",
    description:
      "Get the HTML content of the current page (or a specific element). " +
      "Use this to inspect page structure, find elements, or check content. Returns up to 10,000 characters.",
    input_schema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "Optional CSS selector. If provided, returns HTML of that element. " +
            "If omitted, returns the full page HTML.",
        },
      },
    },
  },
  async execute(input, _ctx): Promise<ToolResult> {
    const selector = input.selector as string | undefined;

    try {
      const html = await getHtml(selector);
      return {
        success: true,
        data: html,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, data: `Get HTML failed: ${msg}` };
    }
  },
};

/**
 * browser_text — получить текст страницы
 */
export const browserText: Tool = {
  definition: {
    name: "browser_text",
    description:
      "Get the visible text content of the current page (or a specific element). " +
      "Use this to quickly read page content without HTML markup.",
    input_schema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description:
            "Optional CSS selector. If provided, returns text of that element. " +
            "If omitted, returns all visible text on the page.",
        },
      },
    },
  },
  async execute(input, _ctx): Promise<ToolResult> {
    const selector = input.selector as string | undefined;

    try {
      const text = await getText(selector);
      return {
        success: true,
        data: text,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, data: `Get text failed: ${msg}` };
    }
  },
};

/**
 * browser_evaluate — выполнить JavaScript
 */
export const browserEvaluate: Tool = {
  definition: {
    name: "browser_evaluate",
    description:
      "Execute JavaScript code in the browser console and return the result. " +
      "Use this to extract data, manipulate the page, or run custom logic.",
    input_schema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "JavaScript code to execute in the browser. Return value is captured and returned.",
        },
      },
      required: ["code"],
    },
  },
  async execute(input, _ctx): Promise<ToolResult> {
    const code = input.code as string;
    if (!code) return { success: false, data: "Missing required field: code" };

    try {
      const result = await evaluate<string>(code);
      return {
        success: true,
        data: typeof result === "string" ? result : JSON.stringify(result, null, 2),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, data: `Evaluate failed: ${msg}` };
    }
  },
};
