# CashClaw

<p align="center">
  <img src="assets/hero.jpg" alt="CashClaw" width="100%" />
</p>

**An autonomous agent that watches freelance marketplaces, filters out the noise and sends you only the jobs actually worth your time.**

🇷🇺 [Русская версия](README.md)  ·  📦 [Latest release](https://github.com/Nikolai444-lab/CashClaw/releases/latest)

CashClaw is a single Node.js process running on your own machine: it polls [FL.ru](https://www.fl.ru/projects/), parses job listings, drops everything that fails your budget and keyword rules, pushes notifications to Telegram and serves a dashboard with live stats.

---

## Features

- **FL.ru monitoring** — polls `fl.ru/projects`, parses listings with `cheerio`, extracts budget, category, response count, city and attachments flag.
- **Honest budget parsing** — ranges like `30 000 – 50 000 руб`, `from 50 000`, `up to 40 000` and `negotiable` are parsed correctly (`src/lib/budget.ts`) instead of being glued into one meaningless number.
- **Filters** — minimum and maximum budget, keywords (title + description) and a decline list.
- **Telegram notifications** — a formatted message with the job title, budget and link; works even when `api.telegram.org` is blocked (raw TLS socket to a known IP with correct SNI, plus HTTP(S) proxy support).
- **No duplicates** — already reported jobs are remembered in `~/.cashclaw/state/fl_seen_ids.json` and restored from logs if the file is lost.
- **Dashboard** — status, counters, the list of found jobs and a live log on `http://localhost:3777`.
- **LLM agent loop** — multi-step tool-use conversation (up to 10 turns) with Anthropic, OpenAI, OpenRouter and DeepSeek support.
- **Self-learning** — study sessions produce knowledge entries, which are later injected into prompts via BM25 search.
- **Working hours** — polling runs 08:00–20:00 MSK by default so it doesn't hammer the site for nothing.

## Screenshots

Monitoring dashboard — status, counters, live log (all data on the screenshots is fictional):

![CashClaw dashboard](docs/screenshots/01-dashboard.png)

Found jobs with budget, category and a link to the project:

![Found jobs list](docs/screenshots/02-orders.png)

---

## Quick start

**Requirements:** Node.js 20+ (tested on 22 and 24), npm.

```bash
git clone https://github.com/Nikolai444-lab/CashClaw.git
cd CashClaw
npm install
npm run build          # CLI bundle (tsup) + UI bundle (vite)
```

Create `~/.cashclaw/cashclaw.json` (see the example below) and run:

```bash
node dist/index.js
```

The process starts the dashboard on `http://localhost:3777` and performs the first poll right away.

### Example config

```json
{
  "agentId": "my-agent",
  "marketplace": "fl",
  "llm": {
    "provider": "deepseek",
    "model": "deepseek-chat",
    "apiKey": "***"
  },
  "polling": { "intervalMs": 60000, "urgentIntervalMs": 10000 },
  "specialties": ["Web development", "Data scraping"],
  "autoQuote": true,
  "autoWork": false,
  "maxConcurrentTasks": 3,
  "declineKeywords": ["for free", "unpaid test"],
  "learningEnabled": true,
  "studyIntervalMs": 1800000,
  "telegram": {
    "botToken": "123456789:YOUR_BOT_TOKEN",
    "chatId": "123456789",
    "minBudgetRub": 15000,
    "keywords": ["parser", "bot", "landing"],
    "proxy": ""
  }
}
```

Get `botToken` from [@BotFather](https://t.me/BotFather); `chatId` is the target chat or channel. Fill in `proxy` only if `api.telegram.org` is not reachable directly.

---

## How it works

```
FL.ru  ──HTTP──>  fl/cli.ts ──> filters ──> fl-heartbeat ──> Telegram
   (listing parser)  (budget/keys)     (every 60 s)      (notification)
                                            │
                                            ├── dashboard  :3777
                                            └── logs and knowledge base (~/.cashclaw)
```

1. **Poll.** The heartbeat requests the job list once a minute, keeping a delay between requests.
2. **Filter.** Each job is checked against budget, keywords and the decline list; already seen IDs are skipped.
3. **Notify.** A matching job goes to Telegram and to the log; the dashboard updates.
4. **Agent (optional).** The agent loop can read a job, produce a quote and store takeaways in the knowledge base, so the next similar job benefits from that experience.

## Configuration

| Field | Type | Default | Purpose |
|---|---|---|---|
| `marketplace` | `fl` \| `kwork` | `fl` | Monitoring engine. Use `fl` for this build |
| `llm.provider` | `anthropic` \| `openai` \| `openrouter` \| `deepseek` | `anthropic` | LLM provider |
| `llm.model` | string | per provider | Model name |
| `llm.apiKey` | string | — | Provider API key |
| `polling.intervalMs` | number | `60000` | Poll interval, ms |
| `specialties` | string[] | `[]` | Agent specialties, feed the system prompt |
| `autoQuote` / `autoWork` | bool | `true` / `true` | Automatic quoting and task execution |
| `declineKeywords` | string[] | `[]` | Jobs containing these words are skipped |
| `learningEnabled` | bool | `true` | Enable self-learning |
| `telegram.minBudgetRub` | number | `0` | Don't notify about cheaper jobs |
| `telegram.keywords` | string[] | — | Notify only about these keywords |
| `telegram.proxy` | string | — | Proxy for Telegram API access |

## Dashboard and API

The dashboard lives on `:3777` and reads from JSON endpoints:

| Endpoint | Returns |
|---|---|
| `GET /api/status` | Heartbeat state, poll count, uptime |
| `GET /api/tasks` | Found jobs and the event feed |
| `GET /api/stats` | Aggregate statistics |
| `GET /api/logs` | Log tail |
| `GET /api/config` | Current config (LLM key masked) |
| `POST /api/start` / `POST /api/stop` | Start and stop monitoring |

## Limitations

Straight about what is missing:

- **No automatic bidding.** `placeBid()` and `sendMessage()` in `src/fl/cli.ts` are stubs. The agent *monitors* and notifies; the decision and the response are yours.
- **Kwork is not supported and will not be.** The platform does not allow programmatic responses — the `kwork-api` library cannot submit bids, and this is a hard requirement of the platform's policy. Parsing code exists, but a full "found it → applied" flow on Kwork is not possible.
- **FL.ru tools are not wired into the agent tool registry** (`src/tools/registry.ts`) yet — the loop currently runs on the base tool set.
- **The price on an individual job page** is not parsed (requires a session) — notifications rely on the listing, which does include the budget.

## Installation and setup as a service

If you'd rather not set it up yourself, I can install and configure it for you: tune the filters for your niche, hook up the Telegram bot and get it running on your machine or server. Get in touch: [github.com/Nikolai444-lab](https://github.com/Nikolai444-lab).

## Roadmap

- Respond to a job straight from the notification.
- Wire the FL.ru tools into the agent loop.
- Flexible polling schedule instead of a fixed 08:00–20:00 window.

## License

MIT — see [LICENSE](LICENSE). Distributed with the copyright notice of the original open-source project preserved (see the LICENSE file).

## Development

```bash
npm run dev         # run via tsx with hot reload
npm run build       # CLI bundle (tsup)
npm run build:ui    # UI bundle (vite)
npm test            # tests (vitest, files live in test/)
npm run typecheck   # type check
```
