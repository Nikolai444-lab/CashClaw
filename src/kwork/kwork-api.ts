/**
 * Прослойка для kwork-api (CommonJS → ESM)
 *
 * kwork-api внутренне использует node-persist, который
 * не работает напрямую в ESM. Эта прослойка форкает
 * дочерний процесс, который загружает kwork-api через require().
 */

import { fork } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { type KworkProject } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface WorkerRequest {
  id: number;
  method: string;
  args: unknown[];
}

interface WorkerResponse {
  id: number;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface KworkApiOptions {
  login: string;
  password: string;
  phone: string;
  proxy?: string;
  categories?: number[];
}

/**
 * KworkApiClient — обёртка над kwork-api через child_process
 */
export class KworkApiClient {
  private worker!: ReturnType<typeof fork>;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private workerPath: string;
  private ready = false;
  private pendingQueue: Array<{ id: number; method: string; args: unknown[] }> = [];

  constructor(private options: KworkApiOptions) {
    // Воркер лежит рядом с этим файлом в исходниках
    // При сборке tsup не копирует .cjs файлы, поэтому ищем в нескольких местах
    const possiblePaths = [
      resolve(__dirname, "kwork-worker.cjs"),            // рядом с kwork-api.ts
      resolve(__dirname, "../../dist/kwork-worker.cjs"), // в dist/
      resolve(process.env.HOME || "/root", ".cashclaw/kwork-worker.cjs"),
    ];

    let found = possiblePaths.find((p) => existsSync(p));
    if (!found) {
      // Копируем воркер в домашнюю директорию
      const srcPath = possiblePaths[0];
      const destPath = resolve(process.env.HOME || "/root", ".cashclaw/kwork-worker.cjs");
      if (existsSync(srcPath)) {
        writeFileSync(destPath, readFileSync(srcPath));
        found = destPath;
      } else {
        found = this.generateWorker(destPath);
      }
    }
    this.workerPath = found;
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Kwork worker init timeout")), 15000);

      this.worker = fork(this.workerPath, [], {
        stdio: ["pipe", "pipe", "pipe", "ipc"],
        env: {
          ...process.env,
          KW_LOGIN: this.options.login,
          KW_PASSWORD: this.options.password,
          KW_PHONE: this.options.phone,
          KW_PROXY: this.options.proxy || "",
        },
      });

      this.worker.on("message", (msg: unknown) => {
        const response = msg as WorkerResponse;

        if (response.id === 0 && response.ok) {
          // Init ready
          clearTimeout(timeout);
          this.ready = true;
          // Flush pending queue
          for (const req of this.pendingQueue) {
            this.send(req.id, req.method, req.args);
          }
          this.pendingQueue = [];
          resolve();
          return;
        }

        const pending = this.pending.get(response.id);
        if (pending) {
          this.pending.delete(response.id);
          if (response.ok) {
            pending.resolve(response.data);
          } else {
            pending.reject(new Error(response.error || "Unknown error"));
          }
        }
      });

      this.worker.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.worker.on("exit", (code) => {
        clearTimeout(timeout);
        this.ready = false;
        // Reject all pending
        for (const [, pending] of this.pending) {
          pending.reject(new Error(`Worker exited with code ${code}`));
        }
        this.pending.clear();
      });

      // Send init
      this.worker.send({ id: 0, method: "init", args: [] } satisfies WorkerRequest);
    });
  }

  async getProjects(categories?: number[], page?: number): Promise<KworkProject[]> {
    return this.call("getProjects", [categories || [], page || 1]) as Promise<KworkProject[]>;
  }

  async getWorkerOrders(): Promise<unknown[]> {
    return this.call("getWorkerOrders", []) as Promise<unknown[]>;
  }

  async getMe(): Promise<Record<string, unknown>> {
    return this.call("getMe", []) as Promise<Record<string, unknown>>;
  }

  async getFavouriteCategories(): Promise<unknown[]> {
    return this.call("getFavouriteCategories", []) as Promise<unknown[]>;
  }

  async subscribe(): Promise<void> {
    return this.call("subscribe", []) as Promise<void>;
  }

  destroy(): void {
    if (this.worker && !this.worker.killed) {
      this.worker.kill();
    }
  }

  private async call(method: string, args: unknown[]): Promise<unknown> {
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      if (!this.ready) {
        this.pendingQueue.push({ id, method, args });
        return;
      }

      this.send(id, method, args);
    });
  }

  private send(id: number, method: string, args: unknown[]): void {
    if (this.worker && !this.worker.killed) {
      this.worker.send({ id, method, args } satisfies WorkerRequest);
    }
  }

  private generateWorker(path: string): string {
    const code = `
const { createRequire } = require('module');
const req = createRequire(__filename);
const Kwork = req('${resolve(__dirname, "../../node_modules/kwork-api")}');

const login = process.env.KW_LOGIN;
const password = process.env.KW_PASSWORD;
const phone = process.env.KW_PHONE;
const proxy = process.env.KW_PROXY || undefined;

const client = new Kwork(login, password, phone, proxy);
let inited = false;

process.on('message', async (msg) => {
  if (msg.method === 'init') {
    // Даём время на асинхронную инициализацию
    setTimeout(async () => {
      try {
        await client.getMe();
        inited = true;
        process.send({ id: 0, ok: true, data: null });
      } catch (e) {
        process.send({ id: 0, ok: true, data: null });
        inited = true;
      }
    }, 2000);
    return;
  }

  if (!inited && msg.method !== 'init') {
    process.send({ id: msg.id, ok: false, error: 'Not initialized yet' });
    return;
  }

  try {
    let result;
    switch (msg.method) {
      case 'getProjects':
        result = await client.getProjects(msg.args[0], msg.args[1]);
        break;
      case 'getWorkerOrders':
        result = await client.getWorkerOrders();
        break;
      case 'getMe':
        result = await client.getMe();
        break;
      case 'getFavouriteCategories':
        result = await client.getFavouriteCategories();
        break;
      case 'subscribe':
        client.onNewProject.subscribe((p) => process.send({ id: -1, ok: true, data: p }));
        result = true;
        break;
      default:
        throw new Error('Unknown method: ' + msg.method);
    }
    process.send({ id: msg.id, ok: true, data: result });
  } catch (e) {
    process.send({ id: msg.id, ok: false, error: e.message });
  }
});
`;

    writeFileSync(path, code, "utf-8");
    return path;
  }
}
