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
 Model provider (OpenAI Responses API)
```

## Modes

Two explicit modes. Production never silently falls back to mock AI.

| Mode | How |
| --- | --- |
| **Real** | `AI_MOCK_MODE=false` and `OPENAI_API_KEY` set. Official OpenAI SDK, `responses.create`, `store: false` (application-owned conversation state). |
| **Mock** | `AI_MOCK_MODE=true`. Rule-based **development fallback** (Aether Engine). Not a production model. |

## Quick start

```bash
npm install
cp .env.example .env.local
# For local UI without a provider:
#   AI_MOCK_MODE=true
# For real AI:
#   AI_MOCK_MODE=false
#   OPENAI_API_KEY=...
#   AI_MODEL_DEFAULT=<a model your account can use>
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

{ "message": "Hello", "mode": "general" }
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
- `OPENAI_API_KEY`
- `AI_MODEL_DEFAULT` set to a model your account actually has
- `ALLOW_DEMO_ACCOUNTS` unset
- Persistent disk for `data/`
- Reverse proxy TLS
