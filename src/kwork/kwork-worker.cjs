/**
 * kwork-worker.cjs — CommonJS-воркер для kwork-api
 * Запускается как дочерний процесс из ESM-сборки CashClaw.
 */

const Kwork = require('kwork-api');

const login = process.env.KW_LOGIN;
const password = process.env.KW_PASSWORD;
const phone = process.env.KW_PHONE;
const proxy = process.env.KW_PROXY || undefined;

const client = new Kwork(login, password, phone, proxy);
let inited = false;

process.on('message', async (msg) => {
  try {
    switch (msg.method) {
      case 'init':
        // Даём время на асинхронную инициализацию (node-persist + signIn)
        setTimeout(async () => {
          try {
            await client.getMe();
            inited = true;
          } catch (e) {
            // Даже если getMe не сработал, помечаем как инициализированный
            inited = true;
          }
          if (process.send) process.send({ id: 0, ok: true, data: null });
        }, 3000);
        break;

      case 'getProjects':
        if (!inited) { process.send({ id: msg.id, ok: false, error: 'Not ready' }); return; }
        const projects = await client.getProjects(msg.args[0] || [], msg.args[1] || 1);
        process.send({ id: msg.id, ok: true, data: projects });
        break;

      case 'getWorkerOrders':
        if (!inited) { process.send({ id: msg.id, ok: false, error: 'Not ready' }); return; }
        const orders = await client.getWorkerOrders();
        process.send({ id: msg.id, ok: true, data: orders });
        break;

      case 'getMe':
        if (!inited) { process.send({ id: msg.id, ok: false, error: 'Not ready' }); return; }
        const me = await client.getMe();
        process.send({ id: msg.id, ok: true, data: me });
        break;

      case 'getFavouriteCategories':
        if (!inited) { process.send({ id: msg.id, ok: false, error: 'Not ready' }); return; }
        const cats = await client.getFavouriteCategories();
        process.send({ id: msg.id, ok: true, data: cats });
        break;

      case 'subscribe':
        client.onNewProject.subscribe((p) => {
          if (process.send) process.send({ id: -1, ok: true, data: p });
        });
        process.send({ id: msg.id, ok: true, data: true });
        break;

      default:
        process.send({ id: msg.id, ok: false, error: 'Unknown method: ' + msg.method });
    }
  } catch (e) {
    if (process.send) {
      process.send({ id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
});

// Сообщаем, что воркер запущен
if (process.send) {
  process.send({ id: -2, ok: true, data: 'worker_started' });
}
