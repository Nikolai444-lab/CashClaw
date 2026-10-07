/**
 * files.ts — Инструменты для работы с файлами и проектами
 *
 * Позволяют CashClaw создавать, читать, редактировать файлы,
 * выполнять команды, управлять проектами.
 *
 * Безопасность:
 * - Все операции ограничены рабочей директорией проектов
 * - write_file использует атомарную запись (tmp + rename)
 * - Защита от path traversal (проверка resolved path)
 * - Максимальный размер вывода команд — 50KB
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile, exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolResult, ToolContext } from "./types.js";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

/** Базовая директория, куда CashClaw может писать проекты */
const WORKSPACE_DIR = path.resolve(
  process.env.CASHCLAW_WORKSPACE || path.join(process.env.HOME || "/tmp", "cashclaw-workspace"),
);

/** Максимальный размер вывода команды (50 KB) */
const MAX_OUTPUT_BYTES = 50 * 1024;

/** Максимальный размер читаемого файла (1 MB) */
const MAX_FILE_BYTES = 1024 * 1024;

/** Таймаут для выполнения команд (60 секунд) */
const COMMAND_TIMEOUT_MS = 60_000;

// ═══════════════════════════════════════
//  Вспомогательные функции
// ═══════════════════════════════════════

/**
 * Разрешает путь относительно рабочей директории.
 * Проверяет, что итоговый путь не выходит за пределы WORKSPACE_DIR (path traversal protection).
 */
function resolveSafePath(filePath: string): string {
  const resolved = path.resolve(WORKSPACE_DIR, filePath);
  if (!resolved.startsWith(WORKSPACE_DIR)) {
    throw new Error(
      `Access denied: path "${filePath}" resolves outside workspace (${WORKSPACE_DIR})`,
    );
  }
  return resolved;
}

/**
 * Проверяет, что родительская директория существует (создаёт при необходимости).
 */
function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
}

/**
 * Форматирует размер файла в человекочитаемый вид.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ═══════════════════════════════════════
//  Инструменты
// ═══════════════════════════════════════

/**
 * read_file — чтение содержимого файла
 */
export const readFile: Tool = {
  definition: {
    name: "read_file",
    description:
      "Read the contents of a file. Supports text files (up to 1MB). " +
      "Returns the file content and metadata (size, modified time, line count). " +
      "Use for reading source code, configs, logs, and text deliverables.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description:
            "Path to the file, relative to workspace or absolute. " +
            "Example: 'project/src/index.ts' or './project/README.md'",
        },
        offset: {
          type: "number",
          description:
            "Starting line number (1-indexed). Useful for large files to read in chunks.",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of lines to return. Default: read the whole file.",
        },
      },
      required: ["file_path"],
    },
  },
  async execute(input, _ctx): Promise<ToolResult> {
    try {
      const filePath = input.file_path as string;
      if (!filePath || typeof filePath !== "string") {
        return { success: false, data: "Missing required field: file_path" };
      }

      const resolvedPath = resolveSafePath(filePath);

      if (!fs.existsSync(resolvedPath)) {
        return { success: false, data: `File not found: ${filePath}` };
      }

      const stat = fs.statSync(resolvedPath);
      if (!stat.isFile()) {
        return { success: false, data: `Not a file: ${filePath}` };
      }

      if (stat.size > MAX_FILE_BYTES) {
        return {
          success: false,
          data: `File too large (${formatSize(stat.size)}). Max: ${formatSize(MAX_FILE_BYTES)}. Use offset/limit to read in parts.`,
        };
      }

      const content = fs.readFileSync(resolvedPath, "utf-8");
      const lines = content.split("\n");
      const totalLines = lines.length;

      const offset = (input.offset as number) || 1;
      const limit = (input.limit as number) || totalLines;

      const fromLine = Math.max(1, offset);
      const toLine = Math.min(totalLines, fromLine + limit - 1);
      const selectedLines = lines.slice(fromLine - 1, toLine);
      const preview = selectedLines.join("\n");

      // Если читаем не весь файл — показываем контекст
      const header =
        fromLine === 1 && toLine === totalLines
          ? `File: ${filePath}\nSize: ${formatSize(stat.size)}\nLines: ${totalLines}\n`
          : `File: ${filePath} (lines ${fromLine}-${toLine} of ${totalLines})\n`;

      return {
        success: true,
        data: header + "\n" + preview,
      };
    } catch (err) {
      return {
        success: false,
        data: `Error reading file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

/**
 * write_file — создание или перезапись файла
 */
export const writeFile: Tool = {
  definition: {
    name: "write_file",
    description:
      "Create a new file or overwrite an existing one. " +
      "Use for writing source code, configs, HTML/CSS, scripts, markdown, and deliverables. " +
      "ATTENTION: This overwrites the file completely — use edit_file for partial changes.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description:
            "Path to the file, relative to workspace. " +
            "Example: 'project/src/index.ts' or 'project/README.md'",
        },
        content: {
          type: "string",
          description: "The full file content to write. UTF-8 text.",
        },
        mode: {
          type: "string",
          enum: ["create", "overwrite"],
          description:
            "'create' — fails if file exists (safe mode). 'overwrite' — replaces existing file. Default: overwrite.",
        },
      },
      required: ["file_path", "content"],
    },
  },
  async execute(input, _ctx): Promise<ToolResult> {
    try {
      const filePath = input.file_path as string;
      const content = input.content as string;
      const mode = (input.mode as string) || "overwrite";

      if (!filePath || typeof filePath !== "string") {
        return { success: false, data: "Missing required field: file_path" };
      }
      if (content === undefined || content === null) {
        return { success: false, data: "Missing required field: content" };
      }

      const resolvedPath = resolveSafePath(filePath);

      // Safe mode: don't overwrite existing files
      if (mode === "create" && fs.existsSync(resolvedPath)) {
        return { success: false, data: `File already exists: ${filePath}. Use mode 'overwrite' to replace.` };
      }

      // Убеждаемся, что директория существует
      ensureParentDir(resolvedPath);

      // Атомарная запись: tmp file + rename
      const tmpFile = `${resolvedPath}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tmpFile, content, "utf-8");
      fs.chmodSync(tmpFile, 0o644);

      // Если перезапись — сохраняем backup
      if (mode === "overwrite" && fs.existsSync(resolvedPath)) {
        const stat = fs.statSync(resolvedPath);
        if (stat.size > 0) {
          // Сохраняем backup в .cashclaw/backups/
          const backupDir = path.join(WORKSPACE_DIR, ".cashclaw", "backups");
          fs.mkdirSync(backupDir, { recursive: true });
          const backupName = `${path.basename(resolvedPath)}.${Date.now()}.bak`;
          const backupPath = path.join(backupDir, backupName);
          fs.copyFileSync(resolvedPath, backupPath);
          // Оставляем только 10 последних backup'ов
          cleanupOldBackups(backupDir, 10);
        }
      }

      fs.renameSync(tmpFile, resolvedPath);

      const stat = fs.statSync(resolvedPath);
      const lineCount = content.split("\n").length;

      return {
        success: true,
        data: `Written ${formatSize(stat.size)}, ${lineCount} lines → ${filePath}`,
      };
    } catch (err) {
      return {
        success: false,
        data: `Error writing file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

/**
 * edit_file — точечное редактирование существующего файла
 */
export const editFile: Tool = {
  definition: {
    name: "edit_file",
    description:
      "Edit a file by replacing a specific text block with new content. " +
      "The old_text must match exactly and uniquely in the file. " +
      "Use for targeted changes instead of rewriting the entire file. " +
      "Backs up the original automatically.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file to edit, relative to workspace.",
        },
        old_text: {
          type: "string",
          description:
            "The exact text to replace. Must match exactly and appear only once in the file. " +
            "Include enough context to make it unique (surrounding lines, indentation).",
        },
        new_text: {
          type: "string",
          description: "The replacement text.",
        },
      },
      required: ["file_path", "old_text", "new_text"],
    },
  },
  async execute(input, _ctx): Promise<ToolResult> {
    try {
      const filePath = input.file_path as string;
      const oldText = input.old_text as string;
      const newText = input.new_text as string;

      if (!filePath || typeof filePath !== "string") {
        return { success: false, data: "Missing required field: file_path" };
      }
      if (typeof oldText !== "string" || !oldText) {
        return { success: false, data: "Missing required field: old_text" };
      }
      if (typeof newText !== "string") {
        return { success: false, data: "Missing required field: new_text" };
      }

      const resolvedPath = resolveSafePath(filePath);

      if (!fs.existsSync(resolvedPath)) {
        return { success: false, data: `File not found: ${filePath}` };
      }

      const content = fs.readFileSync(resolvedPath, "utf-8");

      // Проверяем, что old_text встречается ровно один раз
      const occurrences = content.split(oldText).length - 1;
      if (occurrences === 0) {
        return {
          success: false,
          data: `old_text not found in file. Make sure the text matches exactly (including whitespace).`,
        };
      }
      if (occurrences > 1) {
        return {
          success: false,
          data: `Found ${occurrences} occurrences of old_text. Include more surrounding context to make it unique.`,
        };
      }

      const newContent = content.replace(oldText, newText);

      // Бэкап
      const backupDir = path.join(WORKSPACE_DIR, ".cashclaw", "backups");
      fs.mkdirSync(backupDir, { recursive: true });
      const backupName = `${path.basename(resolvedPath)}.${Date.now()}.bak`;
      const backupPath = path.join(backupDir, backupName);
      fs.copyFileSync(resolvedPath, backupPath);

      // Атомарная запись
      const tmpFile = `${resolvedPath}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tmpFile, newContent, "utf-8");
      fs.renameSync(tmpFile, resolvedPath);

      return {
        success: true,
        data: `Edited ${filePath} (${occurrences} replacement made). Backup saved.`,
      };
    } catch (err) {
      return {
        success: false,
        data: `Error editing file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

/**
 * list_dir — просмотр содержимого директории
 */
export const listDir: Tool = {
  definition: {
    name: "list_dir",
    description:
      "List files and directories in a given path. Returns name, size, type, " +
      "and last modified time for each entry. Use to explore project structure.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Directory path, relative to workspace. " +
            "Example: '' (root) or 'src/components' or 'project'",
        },
        depth: {
          type: "number",
          description:
            "How deep to recurse (0 = current dir only, 1 = one level, etc). Default: 0",
        },
        show_hidden: {
          type: "boolean",
          description: "Show hidden files (starting with .). Default: false.",
        },
      },
      required: [],
    },
  },
  async execute(input, _ctx): Promise<ToolResult> {
    try {
      const dirPath = (input.path as string) || "";
      const depth = (input.depth as number) || 0;
      const showHidden = Boolean(input.show_hidden);

      if (typeof dirPath !== "string") {
        return { success: false, data: "path must be a string" };
      }

      const resolvedPath = resolveSafePath(dirPath);

      if (!fs.existsSync(resolvedPath)) {
        return { success: false, data: `Directory not found: ${dirPath || "."}` };
      }

      if (!fs.statSync(resolvedPath).isDirectory()) {
        return { success: false, data: `Not a directory: ${dirPath || "."}` };
      }

      const lines: string[] = [];
      lines.push(`Directory: ${dirPath || "."}\n`);

      const entries = collectDirEntries(resolvedPath, "", depth, showHidden);
      if (entries.length === 0) {
        lines.push("(empty)");
      } else {
        lines.push(entries.join("\n"));
      }

      return {
        success: true,
        data: lines.join("\n"),
      };
    } catch (err) {
      return {
        success: false,
        data: `Error listing directory: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

function collectDirEntries(
  basePath: string,
  prefix: string,
  maxDepth: number,
  showHidden: boolean,
  currentDepth = 0,
): string[] {
  const lines: string[] = [];
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(basePath, { withFileTypes: true });
  } catch {
    return [];
  }

  // Сортируем: директории вверх, файлы вниз, внутри по имени
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) {
      return a.isDirectory() ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (!showHidden && entry.name.startsWith(".")) continue;
    // Пропускаем .cashclaw служебную директорию
    if (entry.name === ".cashclaw") continue;

    if (entry.isDirectory()) {
      lines.push(`${prefix}📁 ${entry.name}/`);
      if (currentDepth < maxDepth) {
        const sub = collectDirEntries(
          path.join(basePath, entry.name),
          `${prefix}  `,
          maxDepth,
          showHidden,
          currentDepth + 1,
        );
        lines.push(...sub);
      }
    } else {
      let size = "";
      try {
        const stat = fs.statSync(path.join(basePath, entry.name));
        size = formatSize(stat.size);
      } catch { /* ignore */ }
      lines.push(`${prefix}📄 ${entry.name} (${size})`);
    }
  }

  return lines;
}

/**
 * run_command — выполнение команды в терминале
 */
export const runCommand: Tool = {
  definition: {
    name: "run_command",
    description:
      "Execute a shell command in the workspace directory. " +
      "Use for: installing npm packages (npm install), running TypeScript (npx tsc), " +
      "running Python scripts (python3 script.py), git operations, building projects, tests. " +
      "Output is limited to 50KB. Command timeout: 60 seconds.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "Shell command to execute. Examples: 'npm install', 'npx tsc --noEmit', " +
            "'python3 script.py', 'npm run build', 'git status'",
        },
        cwd: {
          type: "string",
          description:
            "Working directory for the command, relative to workspace. " +
            "Defaults to workspace root.",
        },
      },
      required: ["command"],
    },
  },
  async execute(input, _ctx): Promise<ToolResult> {
    try {
      const command = input.command as string;
      const cwd = input.cwd as string | undefined;

      if (!command || typeof command !== "string") {
        return { success: false, data: "Missing required field: command" };
      }

      const workingDir = cwd ? resolveSafePath(cwd) : WORKSPACE_DIR;

      if (!fs.existsSync(workingDir)) {
        return { success: false, data: `Working directory not found: ${cwd || "."}` };
      }

      console.log(`[files] exec: ${command} (cwd: ${workingDir})`);
      const startTime = Date.now();

      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES + 1024,
        env: {
          ...process.env,
          HOME: process.env.HOME,
          PATH: process.env.PATH,
        },
      });

      const elapsed = Date.now() - startTime;

      let output = `$ ${command}\n`;
      output += `(cwd: ${cwd || "."}, ${elapsed}ms)\n\n`;

      if (stdout) {
        const truncated = stdout.slice(0, MAX_OUTPUT_BYTES);
        output += truncated;
        if (truncated.length < stdout.length) {
          output += "\n... [output truncated, 50KB limit]";
        }
      }

      if (stderr) {
        if (output.length + stderr.length > MAX_OUTPUT_BYTES) {
          output += `\n\nstderr: ${stderr.slice(0, 1000)}... [truncated]`;
        } else {
          output += `\n\nstderr:\n${stderr}`;
        }
      }

      if (!stdout && !stderr) {
        output += "(no output)";
      }

      // Проверяем exit code через ошибку, если команда упала
      return {
        success: true,
        data: output,
      };
    } catch (err) {
      const elapsed = "command execution failed";
      let output = `$ ${input.command as string}\n\n`;
      output += `Error: ${err instanceof Error ? err.message : String(err)}`;

      // Если exec упал с кодом, выводим stderr
      if (err instanceof Error && "stdout" in err && "stderr" in err) {
        const execErr = err as NodeJS.ErrnoException & { stdout: string; stderr: string };
        if (execErr.stdout) {
          output += `\n\nstdout:\n${execErr.stdout.slice(0, 2000)}`;
        }
        if (execErr.stderr) {
          output += `\n\nstderr:\n${execErr.stderr.slice(0, 2000)}`;
        }
      }

      return {
        success: true, // Команда выполнилась, даже если с ошибкой — не success=false
        data: output,
      };
    }
  },
};

/**
 * create_project — инициализация нового проекта с шаблоном
 */
export const createProject: Tool = {
  definition: {
    name: "create_project",
    description:
      "Create a new project scaffolding. Supports common project templates: " +
      "'react', 'express', 'typescript-lib', 'python-script', 'python-package', 'html'. " +
      "Creates the directory structure and config files, then the agent can fill in the code.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Project name (also used as directory name). " +
            "Example: 'my-react-app' or 'telegram-bot'",
        },
        template: {
          type: "string",
          enum: ["react", "express", "typescript-lib", "python-script", "python-package", "html"],
          description:
            "Project template to scaffold. Default: 'typescript-lib'",
        },
      },
      required: ["name"],
    },
  },
  async execute(input, _ctx): Promise<ToolResult> {
    try {
      const name = input.name as string;
      if (!name || typeof name !== "string" || !/^[a-zA-Z0-9._-]+$/.test(name)) {
        return {
          success: false,
          data: "Invalid project name. Use only letters, numbers, dots, hyphens, underscores.",
        };
      }

      const template = (input.template as string) || "typescript-lib";
      const projectDir = resolveSafePath(name);

      if (fs.existsSync(projectDir)) {
        return { success: false, data: `Project directory already exists: ${name}` };
      }

      fs.mkdirSync(projectDir, { recursive: true, mode: 0o755 });

      const createdFiles: string[] = [];

      switch (template) {
        case "react":
          createdFiles.push(...await scaffoldReact(projectDir, name));
          break;
        case "express":
          createdFiles.push(...await scaffoldExpress(projectDir, name));
          break;
        case "typescript-lib":
          createdFiles.push(...await scaffoldTsLib(projectDir, name));
          break;
        case "python-script":
          createdFiles.push(...await scaffoldPythonScript(projectDir, name));
          break;
        case "python-package":
          createdFiles.push(...await scaffoldPythonPackage(projectDir, name));
          break;
        case "html":
          createdFiles.push(...await scaffoldHtml(projectDir, name));
          break;
        default:
          // fallback — создаём пустую директорию
          createdFiles.push(`📁 ${name}/`);
      }

      const filesList = createdFiles.map((f) => `  - ${f}`).join("\n");
      return {
        success: true,
        data: `Created project "${name}" (template: ${template})\n\nFiles:\n${filesList}\n\nUse write_file and edit_file tools to add source code.`,
      };
    } catch (err) {
      return {
        success: false,
        data: `Error creating project: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};

// ═══════════════════════════════════════
//  Шаблоны проектов
// ═══════════════════════════════════════

async function scaffoldReact(dir: string, name: string): Promise<string[]> {
  const files: string[] = [];

  // package.json
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc && vite build",
      preview: "vite preview",
    },
    dependencies: {
      react: "^19.0.0",
      "react-dom": "^19.0.0",
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^4.3.0",
      typescript: "^5.7.0",
      vite: "^6.0.0",
    },
  }, null, 2));
  files.push("package.json");

  // tsconfig
  writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: "dist",
    },
    include: ["src"],
  }, null, 2));
  files.push("tsconfig.json");

  // vite config
  writeFileSync(path.join(dir, "vite.config.ts"),
    `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`);
  files.push("vite.config.ts");

  // index.html
  writeFileSync(path.join(dir, "index.html"),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);
  files.push("index.html");

  // src
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(path.join(dir, "src", "main.tsx"),
    `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`);
  files.push("src/main.tsx");

  writeFileSync(path.join(dir, "src", "App.tsx"),
    `import React from "react";

function App() {
  return (
    <div>
      <h1>${name}</h1>
      <p>Built with React + TypeScript + Vite</p>
    </div>
  );
}

export default App;
`);
  files.push("src/App.tsx");

  return files;
}

async function scaffoldExpress(dir: string, name: string): Promise<string[]> {
  const files: string[] = [];

  writeFileSync(path.join(dir, "package.json"), JSON.stringify({
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "tsx watch src/index.ts",
      build: "tsc",
      start: "node dist/index.js",
    },
    dependencies: {
      express: "^5.0.0",
    },
    devDependencies: {
      "@types/express": "^5.0.0",
      "@types/node": "^22.0.0",
      typescript: "^5.7.0",
      tsx: "^4.19.0",
    },
  }, null, 2));
  files.push("package.json");

  writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      outDir: "dist",
      rootDir: "src",
    },
    include: ["src"],
  }, null, 2));
  files.push("tsconfig.json");

  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(path.join(dir, "src", "index.ts"),
    `import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ service: "${name}", status: "ok" });
});

app.listen(port, () => {
  console.log(\`Server running on http://localhost:\${port}\`);
});
`);
  files.push("src/index.ts");

  return files;
}

async function scaffoldTsLib(dir: string, name: string): Promise<string[]> {
  const files: string[] = [];

  writeFileSync(path.join(dir, "package.json"), JSON.stringify({
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    main: "dist/index.js",
    types: "dist/index.d.ts",
    scripts: {
      build: "tsc",
      dev: "tsx src/index.ts",
      typecheck: "tsc --noEmit",
    },
    devDependencies: {
      "@types/node": "^22.0.0",
      typescript: "^5.7.0",
      tsx: "^4.19.0",
    },
  }, null, 2));
  files.push("package.json");

  writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      declaration: true,
      outDir: "dist",
      rootDir: "src",
    },
    include: ["src"],
  }, null, 2));
  files.push("tsconfig.json");

  writeFileSync(path.join(dir, ".gitignore"), "node_modules\ndist\n.cashclaw\n");
  files.push(".gitignore");

  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(path.join(dir, "src", "index.ts"),
    `/**
 * ${name}
 * Auto-generated project
 */

export function greet(name: string): string {
  return \`Hello, \${name}! This is the ${name} library.\`;
}
`);
  files.push("src/index.ts");

  return files;
}

async function scaffoldPythonScript(dir: string, name: string): Promise<string[]> {
  const files: string[] = [];

  writeFileSync(path.join(dir, "requirements.txt"), "# Python dependencies\n# requests\n# beautifulsoup4\n# pandas\n");
  files.push("requirements.txt");

  writeFileSync(path.join(dir, ".gitignore"), "__pycache__\n*.pyc\n.venv\n.cashclaw\n");
  files.push(".gitignore");

  // Создаём main.py
  const mainName = name.replace(/[^a-zA-Z0-9_]/g, "_");
  writeFileSync(path.join(dir, "main.py"),
    `#!/usr/bin/env python3
"""
${name}

Auto-generated Python script by CashClaw.
"""


def main():
    print("Hello from ${name}!")


if __name__ == "__main__":
    main()
`);
  files.push("main.py");

  return files;
}

async function scaffoldPythonPackage(dir: string, name: string): Promise<string[]> {
  const files: string[] = [];
  const pkgName = name.replace(/[^a-zA-Z0-9_]/g, "_");

  writeFileSync(path.join(dir, "pyproject.toml"),
    `[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "${pkgName}"
version = "0.1.0"
description = "${name}"
requires-python = ">=3.10"

[tool.setuptools.packages.find]
where = ["src"]
`);
  files.push("pyproject.toml");

  writeFileSync(path.join(dir, "requirements.txt"), "# Python dependencies\n");
  files.push("requirements.txt");

  writeFileSync(path.join(dir, ".gitignore"), "__pycache__\n*.pyc\n.venv\ndist\n.cashclaw\n");
  files.push(".gitignore");

  const srcDir = path.join(dir, "src", pkgName);
  fs.mkdirSync(srcDir, { recursive: true });
  writeFileSync(path.join(srcDir, "__init__.py"),
    `"""
${pkgName} — ${name}
"""
`);
  files.push(`src/${pkgName}/__init__.py`);

  writeFileSync(path.join(srcDir, "main.py"),
    `"""Main module for ${pkgName}."""


def hello() -> str:
    return "Hello from ${name}!"
`);
  files.push(`src/${pkgName}/main.py`);

  return files;
}

async function scaffoldHtml(dir: string, name: string): Promise<string[]> {
  const files: string[] = [];

  writeFileSync(path.join(dir, "index.html"),
    `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <h1>${name}</h1>
  <p>Your content here.</p>

  <script src="script.js"></script>
</body>
</html>
`);
  files.push("index.html");

  writeFileSync(path.join(dir, "style.css"),
    `/* ${name} — styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
  color: #333;
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
`);
  files.push("style.css");

  writeFileSync(path.join(dir, "script.js"),
    `// ${name} — script
console.log("Hello from ${name}!");
`);
  files.push("script.js");

  return files;
}

// ═══════════════════════════════════════
//  Утилиты
// ═══════════════════════════════════════

function writeFileSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function cleanupOldBackups(backupDir: string, maxKeep: number): void {
  try {
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.endsWith(".bak"))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > maxKeep) {
      for (const f of files.slice(maxKeep)) {
        fs.unlinkSync(path.join(backupDir, f.name));
      }
    }
  } catch {
    // silently ignore backup cleanup failures
  }
}
