# PagePilot — Facebook Multi-Page Automation

One dashboard to manage multiple Facebook Pages: connect Pages via official
Meta OAuth (or import a Page token), compose once, publish to many Pages,
schedule posts that run with your browser closed, and track every result.

**Status: code-complete through Phase 8. NOT live-tested** — no Supabase
project, Meta app, or credentials exist yet. Nothing here has published a real
post. See the audit at the bottom.

## Quickstart (local, demo mode)

```bash
npm install
npm run dev      # → http://localhost:5173 (demo data, clearly labelled)
npm test         # 43 vitest unit tests (mock Meta client, in-memory store)
npm run build    # tsc + vite production build
```

Demo mode needs no accounts: every screen works with labelled demo data, and
every unavailable action says exactly why.

## Going live (your accounts, ~1 hour)

1. **Supabase** — follow [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) (project → migrations → env → smoke checks)
2. **Meta app** — follow [`META_APP_SETUP.md`](META_APP_SETUP.md) (app → Facebook Login → redirect URI → deploy functions → test on a TEST Page)
3. **Deploy + scheduler** — follow [`DEPLOY.md`](DEPLOY.md) (frontend host → functions → pg_cron → smoke tests)
4. Stuck? [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)

## Project structure

```
src/
  pages/          12 screens (Dashboard … Diagnostics, Login)
  components/     ui kit, ProtectedRoute
  lib/            supabase client, auth context, db layer, meta wiring,
                  posts API, portable core re-export (core.ts)
  data/demo.ts    labelled demo data (demo mode only)
supabase/
  migrations/     0001 core schema + RLS, 0002 scheduler funcs, 0003 vault
  functions/
    _shared/      portable core: types, store, publishing, scheduler,
                  mock + live Meta clients, video adapters (zero-dep TS —
                  shared by Deno functions AND vitest)
    oauth-start, oauth-callback, pages-list, token-import,
    page-disconnect, page-validate, post-create, account-delete,
    publish-worker
```

## How it works

1. **Connect** — OAuth (state-validated, code exchanged server-side) or manual
   Page-token import (validated via `debug_token`). Tokens live ONLY in
   Supabase Vault; the app stores metadata.
2. **Compose** — one post → one target per Page → one idempotent job per target
   (`pp:<post>:<page>`). Schedules stored in UTC.
3. **Schedule** — `publish-worker` (pg_cron, every minute) claims due jobs with
   `FOR UPDATE SKIP LOCKED`, publishes each target independently, and records
   every attempt. Partial success is reported truthfully.
4. **Recover** — rate limits → exponential backoff; revoked tokens →
   `needs_reauthorization` (never blind-retried); 5 failures → `dead` for manual
   recovery; uncertain timeouts are reconciled before retry (no duplicates).

## Security model

- No Facebook passwords, ever. OAuth only.
- Tokens: Vault-only, never in responses/logs/URLs/browser storage; all errors sanitized.
- RLS on every table (owner-only); service-role paths re-verify ownership in code.
- Scheduler functions locked to service-role; `publish-worker` requires the key.

## Docs

- [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) — database + auth setup, RLS verification
- [`META_APP_SETUP.md`](META_APP_SETUP.md) — Meta app, permissions, dev-mode vs App Review
- [`DEPLOY.md`](DEPLOY.md) — hosting, functions, cron scheduler, smoke tests
- [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) — symptom → fix table
- [`.env.example`](.env.example) — variable names only, no secrets

## Honest audit (2026-10-18)

**Implemented + tested** (43 vitest tests, all passing; `npm run build` green):
- 12-screen responsive UI with honest demo/live dual mode
- Portable publishing core: multi-target creation, idempotency, atomic-claim
  scheduler, exponential backoff, dead-lettering, reconcile-before-retry,
  UTC scheduling + timezone conversion, media validation, error sanitization
- Mock Meta client with scripted failure modes; video/Reels resumable-upload
  adapter against the mock (chunking, progress, processing polls, reel endpoint)

**Implemented, NOT live-tested** (code-complete; needs Supabase project + Meta app):
- Migrations 0001–0003 (schema, RLS, scheduler functions, Vault helpers)
- Supabase Auth wiring, protected routes, login page
- All 9 Edge Functions (OAuth flow, token import/validate/disconnect, post-create,
  account-delete, publish-worker with video routing)
- Live Meta clients (text/image; video/Reels resumable flow)

**Partially implemented**: profile/timezone editing UI (disabled until a polish
pass); password change (documented as reset-email flow, UI stubbed).

**Not implemented**: Meta engagement insights (deliberately — never invent
metrics); AI captions (spec defers until core is stable).

**Needs your accounts/approval**: Supabase project + applied migrations; Meta
app + App Review (only for other people's Pages — your own work in dev mode);
frontend host; enabling the pg_cron scheduler; the first real test post
(explicitly approve before any real publishing).
