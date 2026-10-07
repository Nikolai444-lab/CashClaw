import { startAgent } from "./agent.js";

// Re-exports for testing and external use
export { loadConfig, saveConfig } from "./config.js";
export { sendTelegramMessage, testTelegramConnection } from "./telegram.js";
export { navigate, click, type, screenshot, getHtml, getText, evaluate, closeBrowser } from "./browser.js";
export { matchSkills, listAllSkills, buildSkillsPrompt } from "./skills/matcher.js";

async function main() {
  console.log("Starting CashClaw...");

  const server = await startAgent();

  // Open browser (silently fail if no display available)
  try {
    const url = "http://localhost:3777";
    const { execFile: execFileCb } = await import("node:child_process");
    const opener = process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
    execFileCb(opener, [url], () => {});
  } catch {
    // no-op: headless/server environments
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Запускаем main() только когда index.ts исполняется напрямую
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
