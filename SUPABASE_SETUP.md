# SUPABASE_SETUP.md — PagePilot Phase 2

Connects Supabase Auth, PostgreSQL, and Storage. ~15 minutes. Free tier is enough to start.

## 1. Create the project

1. Go to https://supabase.com/dashboard → **New project**.
2. Name: `pagepilot`. Set a strong database password (save it in a password manager).
3. Region: pick the closest to you (e.g. **South Asia (Mumbai)** for Pakistan).
4. Wait for the project to finish provisioning.

> Free-tier reality (check current limits at https://supabase.com/pricing — they can change):
> database ~500 MB, file storage ~1 GB, Auth MAUs generous. PagePilot's videos are
> the first thing that will hit the 1 GB storage cap — see "Storage strategy" below.

## 2. Apply the migrations (in order)

**Option A — SQL editor (simplest):**
1. Open **SQL Editor** in the Supabase dashboard.
2. Paste the full contents of `supabase/migrations/20261018000001_core_schema.sql` → **Run**.
3. Paste the full contents of `supabase/migrations/20261018000002_scheduler.sql` → **Run**.

**Option B — Supabase CLI:**
```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

## 3. Verify the schema

Run in the SQL editor — every query must return rows, none may error:

```sql
-- Tables exist
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
-- Expected: audit_events, connected_pages, media_assets, oauth_states,
--           post_targets, posts, profiles, publish_attempts, scheduled_jobs

-- RLS is ON everywhere
select tablename from pg_tables
where schemaname = 'public' and rowsecurity = true;
-- Expected: all 9 tables above

-- Storage bucket exists and is private
select id, public from storage.buckets where id = 'pagepilot-media';
-- Expected: one row, public = false

-- Scheduler functions exist and are locked to service_role
select proname from pg_proc where proname in ('claim_due_jobs','release_stale_locks');
-- Expected: 2 rows
```

## 4. Configure Auth

1. **Authentication → Providers → Email**: enabled (default). Confirm-email can stay on.
2. **Authentication → URL Configuration → Site URL**: set to your app URL
   (local dev: `http://localhost:5173`; production: your deployed URL).
3. Add the same URL under **Redirect URLs**.

## 5. Wire the frontend

```bash
cp .env.example .env
```

Fill in (dashboard → **Project Settings → API**):
- `VITE_SUPABASE_URL` = Project URL
- `VITE_SUPABASE_ANON_KEY` = anon public key

Then:
```bash
npm run dev
```

Open the app → **Diagnostics** should now show **Supabase: OK (env set)**.
Visit `/login`, create an account, sign in. After sign-in, a row should appear in
`public.profiles` (create it via SQL for now — automatic profile creation lands
with the Phase 3 Edge Functions; until then run):

```sql
insert into public.profiles (id, display_name)
select id, email from auth.users
on conflict (id) do nothing;
```

## 6. Storage strategy (important)

- The `pagepilot-media` bucket is **private**. Uploads go to `<user-uuid>/...` paths;
  RLS policies enforce per-user folders.
- **Large videos do NOT belong in Supabase free storage** (1 GB cap). Phase 6
  uploads videos directly toward Meta's resumable endpoints where possible and
  keeps only metadata + thumbnails in Supabase. Documented in DEPLOY.md.

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Login page says "not configured" | `.env` missing or dev server not restarted after editing it |
| RLS blocks your own rows | You are signed in as a different user than the row's `user_id` — by design |
| `claim_due_jobs` permission denied | Call it only with the service-role key (scheduler), never the anon key |
| Storage upload 403 | Object path must start with your auth user UUID |

## 8. RLS isolation verification (run against the live project)

Unit tests cannot prove Row Level Security — only the live database can.
Create two users (sign up twice in the app, or via Auth → Users), then run
these as **service_role** in the SQL editor. Replace the UUIDs.

```sql
-- Pick two real user ids:
--   :uid_a = 'aaaaaaaa-...', :uid_b = 'bbbbbbbb-...'

-- Seed one row per user (service_role bypasses RLS for seeding):
insert into public.posts (user_id, caption, post_type, overall_status)
values
  (:'uid_a', 'A private post', 'text', 'draft'),
  (:'uid_b', 'B private post', 'text', 'draft');

-- Now verify as USER A (use the "Run as" role switcher, or set:
--   set request.jwt.claim.sub = :'uid_a';  -- via a function with auth context)
-- Expected: user A sees exactly 1 post (their own), user B sees exactly 1.
-- Any cross-user row = RLS FAILURE, stop and fix policies before proceeding.

-- Cleanup after verification:
delete from public.posts where user_id in (:'uid_a', :'uid_b');
```

Checklist:
- [ ] A sees only A's rows in `posts`, `connected_pages`, `media_assets`
- [ ] B sees only B's rows
- [ ] `post_targets` / `scheduled_jobs` / `publish_attempts` visible only via owned posts
- [ ] Anon (signed-out) key reads ZERO rows from every table
