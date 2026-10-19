# TROUBLESHOOTING.md — PagePilot

## Login / Auth

| Symptom | Fix |
|---|---|
| Login page says “not configured” | `.env` is missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, or the dev server wasn't restarted after creating `.env` |
| “Invalid login credentials” right after sign-up | Email confirmation is on — check the inbox (or disable confirmations in Auth → Providers for local dev) |
| Redirected to `/login` in a loop | Site URL / Redirect URLs in Supabase Auth settings don't include your frontend URL |

## Facebook / OAuth

| Symptom | Fix |
|---|---|
| “Invalid redirect_uri” on facebook.com | `META_REDIRECT_URI` must EXACTLY match the URI in Facebook Login → Valid OAuth Redirect URIs (trailing slashes matter) |
| OAuth succeeds but 0 Pages listed | The Meta user has no role on any Page, or `pages_show_list` wasn't granted; re-run and check the permission screen |
| Token import: “missing required permissions” | Regenerate the token with all three scopes checked: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list` |
| Token import: “not a Page token” | You pasted a USER token — Page tokens come from `/me/accounts` or the Pages section of Graph API Explorer |
| `needs_reauthorization` after working fine | Token expired/revoked (password change, app removed, Page role changed) — reconnect the Page; this is expected behavior, not a bug |

## Publishing / Scheduler

| Symptom | Fix |
|---|---|
| Job stays `scheduled` forever | Scheduler isn't running: check `cron.job` / `cron.job_run_details`, or hit `publish-worker` manually and read its JSON |
| Job `processing` for 15+ min | Stale lock — `release_stale_locks()` runs each tick; check function logs for a crash |
| `dead` jobs | 5 failed attempts (usually persistent rate limits). Inspect the sanitized error in Logs, wait out the limit, then re-create the post |
| Rate limit errors (code 4/17/32) | Normal under burst load — the scheduler backs off exponentially. Don't hammer retry; it lengthens Meta's block |
| “Published” in PagePilot but nothing on Facebook | Treat the dashboard as a claim, facebook.com as truth — check the Page. If truly missing, the remote id in Logs is your evidence for a Meta bug report |

## Media

| Symptom | Fix |
|---|---|
| Upload 403 | Storage object path must start with your auth user UUID; RLS policies enforce it |
| Image post fails at Meta | The `url` Meta fetches must be publicly reachable — use a signed URL (the worker handles this in Phase 7+); private-bucket paths fail |
| Video too large | Direct-upload cap is 1 GB (`validateMediaFile`); larger needs chunked resumable sessions (Phase 6 transport supports it, UI caps stay) |

## Database

| Symptom | Fix |
|---|---|
| `claim_due_jobs` permission denied | Call it only with the service-role key (scheduler), never the anon key |
| RLS blocks your own rows | You're signed in as a different user than the row's `user_id` — by design. Verify with the two-user script in SUPABASE_SETUP.md |
| Duplicate idempotency key | You're re-creating an identical (post, Page) job — fetch the existing job instead of inserting again |

## Edge Functions

| Symptom | Fix |
|---|---|
| Function 500, vague message | `supabase functions logs <name>` — the #1 cause is a missing secret (`META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `APP_URL`) |
| CORS errors in the browser | Only browser-invoked functions (`oauth-start`, `token-import`, `post-create`, etc.) handle OPTIONS — `oauth-callback` and `publish-worker` are not for browsers |
| `publish-worker` 401 | The Authorization header must be exactly `Bearer <service-role-key>` |
