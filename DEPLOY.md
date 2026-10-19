# DEPLOY.md — PagePilot deployment (Phase 8)

## Be honest about tiers

| Tier | What you get | What it costs |
|---|---|---|
| **Free development** | Everything in this repo: UI, migrations, Edge Functions, tests | $0 |
| **Free-tier deployment** | Live app + real DB + real scheduler on free plans | $0, within quotas |
| **Guaranteed 24/7 production** | No sleep/pausing, higher quotas, support | Paid plan (only with your explicit approval) |

Do NOT promise the free tier behaves like production. Supabase free projects can
pause after inactivity; Vercel/Netlify/Cloudflare free tiers have bandwidth and
execution limits. Check the CURRENT limits on each provider's pricing page before
relying on them — they change.

## A. Deploy the frontend (static — any host)

The frontend is a static Vite build. It cannot run background jobs by itself.

```bash
npm run build   # → dist/
```

- **Netlify:** drag `dist/` into https://app.netlify.com/drop, or `netlify deploy --prod --dir dist`
- **Vercel:** `vercel --prod` (or import the repo)
- **Cloudflare Pages:** `npx wrangler pages deploy dist`

Set these environment variables on the host (NOT in code):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

After deploy, add the frontend URL to Supabase **Authentication → URL Configuration**
(Site URL + Redirect URLs), or login redirects will fail.

## B. Deploy the backend (Supabase)

```bash
# 1. Migrations (if not applied yet)
supabase db push

# 2. Edge Functions
supabase functions deploy oauth-start oauth-callback pages-list token-import \
  page-disconnect page-validate post-create account-delete publish-worker

# 3. Secrets (NEVER in git, NEVER with a VITE_ prefix)
supabase secrets set \
  META_APP_ID=<app-id> \
  META_APP_SECRET=<app-secret> \
  META_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/oauth-callback \
  APP_URL=<your-frontend-url> \
  TOKEN_ENCRYPTION_KEY=<64-hex-chars-from-openssl-rand--hex-32>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
into functions automatically. `TOKEN_ENCRYPTION_KEY` is REQUIRED — every
token-handling function fails loudly without it (the live project has no
Supabase Vault; tokens are encrypted app-side with AES-256-GCM — see
`supabase/migrations/README.md`).

## C. Persistent scheduler (the important one)

The frontend can NEVER run scheduled posts with the browser closed. Pick one:

### Option 1 — Supabase pg_cron + pg_net (recommended, stays in one project)

1. **Database → Extensions**: enable `pg_cron` and `pg_net` (verify they are
   available on your plan — if not, use Option 2).
2. Schedule the worker every minute:

```sql
select cron.schedule(
  'pagepilot-publish-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/publish-worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <service-role-key>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

3. Verify: `select * from cron.job;` → one row, active. After a minute, check
   `select * from cron.job_run_details order by start_time desc limit 5;`

> The service-role key lives inside the database for this job. That is the
> standard pattern for pg_cron workers, but treat the key as the crown jewels:
> never paste it into chat, issues, or frontend code.

### Option 2 — Cloudflare Worker cron (if pg_cron is unavailable)

A free Cloudflare Worker with a cron trigger (`* * * * *`) that POSTs to the
`publish-worker` function URL with the service-role key in the Authorization
header. Same security note about the key applies.

### What the scheduler does each tick

1. `publish-worker` fans out per user with due jobs.
2. `claim_due_jobs()` atomically claims ≤10 jobs (`FOR UPDATE SKIP LOCKED`).
3. Each target publishes via the Meta Graph API (text/image direct; video/reel
   via the resumable adapter).
4. Outcomes: `published` only on real API confirmation; rate limits → exponential
   backoff; revoked tokens → `needs_reauthorization` (no blind retry);
   5 failures → `dead` (manual recovery from the Queue/Logs screens).
5. `release_stale_locks()` frees jobs stuck `processing` > 15 min (crashed worker).

## D. Production smoke-test checklist

Run these AFTER deploy, in order. Stop at the first failure.

- [ ] `npm run build` passes locally; deployed frontend loads with no console errors
- [ ] `/login` → create account → sign in → redirected to `/`
- [ ] **Diagnostics**: Supabase row shows OK
- [ ] **Add Page → Continue with Facebook** → approve on facebook.com → lands on `/pages` with the Page listed `healthy`
- [ ] **Connected Pages → Validate** → status refreshes, `last_checked_at` updates
- [ ] **Media Library** → upload a small JPG → appears in the list (private bucket)
- [ ] **Create Post** → text post → **Publish Now** to a TEST Page → appears in **Queue** as `processing`/`published` within ~1–2 min (scheduler tick)
- [ ] Check the TEST Page on facebook.com — the post is really there (never trust the dashboard alone)
- [ ] **Create Post** → schedule a post 5 minutes out → close the browser → reopen after 6 min → published
- [ ] **Logs** → attempt rows exist with sanitized messages (no tokens anywhere)
- [ ] **Account → Export my data** → JSON downloads, no token fields (`*_vault_secret_id`, `token_ciphertext`) inside
- [ ] Revoke the test Page token at facebook.com/settings → next **Validate** shows `needs_reauthorization`

## E. Free-tier limits to verify (check current docs, not this file)

- Supabase: database size, storage GB, Edge Function invocations, Auth MAU
- Frontend host: bandwidth, build minutes
- Meta: app rate limits (per-app/per-page call quotas — the scheduler backs off, but quotas are real)
- Videos: Supabase storage is NOT the video pipeline — videos stream from storage to Meta at publish time; the 1 GB free storage cap is the first wall you'll hit

## F. Rollback

- Frontend: redeploy the previous `dist/` (keep it).
- Functions: `supabase functions deploy <name>` re-deploys from the repo; previous versions are in the dashboard.
- Migrations are forward-only — never edit an applied migration; write a new one.
- Cron: `select cron.unschedule('pagepilot-publish-every-minute');`
