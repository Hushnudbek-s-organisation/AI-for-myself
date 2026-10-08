# Aether audit (Phase 0) — 2026-10-08

This audit was performed against the existing Next.js implementation **before** production hardening. Status labels: REAL / PARTIAL / MOCKED / SIMULATED / BROKEN / MISSING / UNTESTED / PRODUCTION-UNSAFE.

## Inventory

| Item | Found |
| --- | --- |
| Framework | Next.js 15.5 (App Router), React 19, TypeScript |
| Database | Node.js built-in `node:sqlite` (`data/aether.db`), WAL. `sql.js` is an unused dependency. No ORM, no migration runner (CREATE IF NOT EXISTS). |
| Auth | jose JWT in httpOnly cookie `aether_session`; bcryptjs passwords |
| AI SDK | **None.** Manual `fetch` to `/chat/completions`. No official `openai` package. |
| Tests | Vitest, 17 unit tests. Isolation test does **not** hit SQLite. |
| Voice | Browser `SpeechRecognition` + `speechSynthesis` only |
| Files | Extracted text in SQLite. PDF is a stub string. No disk blobs. |

## Feature reality matrix

| Feature | Exists | Actually works | Real provider | Tested | Production ready |
| --- | --- | --- | --- | --- | --- |
| AI Core / Gateway | Yes | PARTIAL — one path, but duplicate history, tool ACL tautology | MOCKED builtin by default | Unit only | PRODUCTION-UNSAFE |
| Chat UI | Yes | REAL for CRUD/stream against builtin | MOCKED | UNTESTED E2E | PARTIAL |
| Streaming | Yes SSE | REAL against builtin; abort does not cancel provider | MOCKED | PARTIAL | PARTIAL |
| History | Yes | REAL per-user list/load | n/a | Isolation UNTESTED vs DB | PARTIAL |
| Skills | Yes | PARTIAL — create/edit/version/export; **no import**; drafts stay inactive | n/a | Security unit | PARTIAL |
| Prompt system | Yes | PARTIAL — user library; no rollback UI; no historical prompt pin | n/a | Hierarchy unit | PARTIAL |
| Files | Yes | PARTIAL — txt/docx; PDF SIMULATED | n/a | MISSING | PRODUCTION-UNSAFE |
| Voice | Yes UI | PARTIAL — Chromium STT; no provider abstraction; no failure state machine | Browser only | MISSING | Not universal |
| Public API | Yes `/v1/*` rewrite | REAL vs builtin | MOCKED | PARTIAL | PARTIAL |
| API keys | Yes hashed SHA-256 | REAL create/list/revoke | n/a | Unit hash | PARTIAL (rpm unused) |
| Projects | Yes | PARTIAL — create/list; **permissions not enforced in gateway** | n/a | MISSING | PRODUCTION-UNSAFE |
| Auth | Yes | REAL login/register/guest | n/a | MISSING | PRODUCTION-UNSAFE (demo passwords, default JWT secret) |
| Usage | Yes | PARTIAL — estimated tokens, not provider usage | n/a | MISSING | PARTIAL |
| Security | Hierarchy + wrappers | PARTIAL — regex injection, not model-proof | n/a | 11 unit | PRODUCTION-UNSAFE (CSRF, headers, CORS, demo accounts) |

## Aether Engine

**Development fallback / rule-based simulator.** Not model inference. Heuristic analyzers + templates. Must never be presented as production AI.

## Critical defects to fix

1. Silent fallback to builtin whenever `OPENAI_API_KEY` is missing (including production).
2. OpenAI path uses ad-hoc Chat Completions, estimated tokens, no timeout/abort/`store: false`.
3. Hardcoded demo/admin passwords seeded in every environment; login form prefilled.
4. Default JWT secret if env missing.
5. `projectAllowsMode` dead code; API clients can request any skill/model.
6. Skill `allowedTools` filter is a tautology (all skill tools pass).
7. User message duplicated into the assembled prompt (history already contains it).
8. Rate limit ignores per-key `rate_limit_rpm`.
9. Role taken from JWT, not reloaded from DB.
10. No security headers, no CSRF origin check, no CORS policy.
11. PDF “extraction” is a placeholder sentence.
12. Isolation test does not open the database.
13. Health endpoint always `{ok:true}` and runs seed (side effect).
14. No request IDs / structured logs; provider errors can leak.
15. `sql.js` unused; `pdf-parse` listed in next.config but not installed.

## Update — free-key model resolution (2026-10-08)

Defect **1** above ("silent fallback to builtin") and the hardcoded paid model defaults it shipped with are now closed:

| Before | Now |
| --- | --- |
| Paid/fictional defaults baked into config (`gpt-6-luna`, `gpt-5.5`, `grok-4.7`, `gemini-2.5-pro`). | No model id in the repo. The picker is `chatgpt` / `gemini` / `grok`. |
| A key that could not call the configured model 401/404s at generate time. | The gateway lists that key's own models (`GET /models`, 4 s timeout, fails soft) and sends the cheapest/fastest id the account actually returned. |
| Missing/unusable model silently degraded or 404'd. | `503 model_unavailable` naming the env var to set (`OPENAI_MODEL` / `GEMINI_MODEL` / `GROK_MODEL`). Never mock, never a guessed paid id. |

Optional overrides exist for pinning a free-tier id from a provider dashboard; they are documented as optional in `.env.example` and are never required. Keys stay in `.env` only, and `/api/health` + `/api/v1/models` expose the resolved wire id — never the key.
