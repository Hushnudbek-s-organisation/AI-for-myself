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

Pick a model in chat or `POST /v1/chat` `{ "model": "gpt-6-luna" }`. Catalog aliases:

| Catalog id | Provider | Notes |
| --- | --- | --- |
| `gpt-6-luna` | OpenAI | ChatGPT 6 Luna. Wire id: `OPENAI_MODEL_LUNA`. Responses API, `store: false`. |
| `gemini-2.5-flash` / `gemini-2.5-pro` | Gemini | Google AI Studio `generateContent` stream. |
| `grok-4.7` | Grok | xAI `https://api.x.ai/v1/chat/completions`. |

Env vars remap wire IDs so this repo does not invent account-specific model names.

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

{ "message": "Hello", "mode": "general", "model": "gpt-6-luna" }
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
