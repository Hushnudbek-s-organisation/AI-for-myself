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
 ChatGPT  ·  Gemini  ·  Grok
```

## Modes

Two explicit modes. Production never silently falls back to mock AI.

| Mode | How |
| --- | --- |
| **Real** | `AI_MOCK_MODE=false` and at least one API key. |
| **Mock** | `AI_MOCK_MODE=true`. Rule-based **development fallback**. Not a production model. |

Chat picker is just **ChatGPT / Gemini / Grok**. You do not put model names in `.env` unless an account needs a specific id.

| Picker / `model` | Key | API |
| --- | --- | --- |
| `chatgpt` | `OPENAI_API_KEY` | OpenAI Responses, `store: false` |
| `gemini` | `GEMINI_API_KEY` | Google AI Studio `generateContent` |
| `grok` | `XAI_API_KEY` | xAI `https://api.x.ai/v1/chat/completions` |

## Quick start

```bash
npm install
cp .env.example .env.local
# Local UI only:
#   AI_MOCK_MODE=true
# Real AI — keys only:
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

`model` may be `chatgpt`, `gemini`, or `grok`. Keys are hashed at rest (SHA-256). Docs: `/docs`. Developer: `/developer`.

## Database

SQLite via Node.js `node:sqlite` at `data/aether.db`. Fine for a **single-instance** deployment. For multi-instance production, move to a networked database (Postgres) — WAL files are not a cluster.

Uploads: `data/uploads/{userId}/` plus extracted text in SQLite.

## Voice

Browser Speech Recognition / speechSynthesis only (`BrowserSpeechProvider`). Not universal. Unsupported browsers show an error instead of hanging on “Listening…”.

## Production checklist

- Strong `AETHER_SECRET`
- `AI_MOCK_MODE=false`
- At least one of `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`
- `ALLOW_DEMO_ACCOUNTS` unset
- Persistent disk for `data/`
- Reverse proxy TLS
