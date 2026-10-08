# Aether — Universal AI Platform

Standalone AI operating environment: web chat and a public API on **one AI Core**.

```
Browser / other apps
        ↓
   /v1 API (same gateway)
        ↓
 Auth → project permissions → AI Core
        ↓
 modes / skills / prompts / tools / files
        ↓
 Model router (never called from the browser)
        ↓
 OpenAI Responses  ·  Gemini generateContent  ·  xAI Grok
```

## Modes

Two explicit modes. Production never silently falls back to mock AI.

| Mode | How |
| --- | --- |
| **Real** | `AI_MOCK_MODE=false` and at least one of `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`. |
| **Mock** | `AI_MOCK_MODE=true`. Rule-based **development fallback** (Aether Engine). Not a production model. |

The chat picker — and `POST /v1/chat` `{ "model": "chatgpt" }` — names **providers**, never model ids:

| Picker id | Provider | Wire call |
| --- | --- | --- |
| `chatgpt` | ChatGPT (OpenAI) | Responses API `responses.create`, `store: false`. |
| `gemini` | Gemini | Google AI Studio `streamGenerateContent` (SSE). |
| `grok` | Grok (xAI) | `https://api.x.ai/v1/chat/completions` (SSE). |

**No paid model names are required, and none are hardcoded.** After a key is set, Aether lists that account's own models
(`GET /models` for OpenAI and xAI, `GET {GEMINI_BASE_URL}/models` for Gemini) and sends the cheapest/fastest id that came
back — a free-tier `…-mini` / `…-nano` / `…-flash` style id, whatever your dashboard actually offers. If the list is empty,
chat returns **503** with the env var to set; it never falls back to mock and never guesses a paid id.

Optional overrides, for pinning an exact free-tier id copied from your provider dashboard:

| Env var | Purpose |
| --- | --- |
| `OPENAI_MODEL` | Pin the OpenAI wire id (optional). |
| `GEMINI_MODEL` | Pin the Gemini wire id (optional). |
| `GROK_MODEL` | Pin the Grok wire id (optional). |

Keys live in `.env` only. `GET /api/health` and `GET /api/v1/models` show the resolved wire id per provider — never the key.

## Quick start

```bash
npm install
cp .env.example .env.local
# For local UI without a provider:
#   AI_MOCK_MODE=true
# For real AI (any combination):
#   AI_MOCK_MODE=false
#   OPENAI_API_KEY=...
#   GEMINI_API_KEY=...
#   XAI_API_KEY=...
npm run dev
```

Open http://localhost:3000

Demo accounts (`demo@aether.local` / `demo`) are seeded **only** when `ALLOW_DEMO_ACCOUNTS=true` and never in production.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server `0.0.0.0:3000` |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Next lint |
| `npm test` | Vitest |

## Public API

```http
POST /v1/chat
Authorization: Bearer aether_sk_…
Content-Type: application/json

{ "message": "Hello", "mode": "general", "model": "chatgpt" }
```

Keys are hashed at rest (SHA-256). Copy the plaintext once at creation. Docs: `/docs`. Developer: `/developer`.

## Database

SQLite via Node.js `node:sqlite` at `data/aether.db`. Fine for a **single-instance** deployment. For multi-instance production, move to a networked database (Postgres) — WAL files are not a cluster.

Uploads: `data/uploads/{userId}/` plus extracted text in SQLite.

## Voice

Browser Speech Recognition / speechSynthesis only (`BrowserSpeechProvider`). Not universal. Unsupported browsers show an error instead of hanging on “Listening…”.

## Production checklist

- Strong `AETHER_SECRET`
- `AI_MOCK_MODE=false`
- At least one of `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`
- Model env vars set to IDs your accounts actually have
- `ALLOW_DEMO_ACCOUNTS` unset
- Persistent disk for `data/`
- Reverse proxy TLS
