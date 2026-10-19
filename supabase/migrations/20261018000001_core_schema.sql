-- ============================================================================
-- PagePilot migration 0001 — core schema (Phase 2)
-- Apply in order: 0001, then 0002 (scheduler).
-- Via Supabase CLI:  supabase db push
-- Via dashboard:     paste each file into the SQL editor in order.
-- ============================================================================

-- --------------------------------------------------------------------------
-- profiles: one row per auth user. id matches auth.users(id).
-- --------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Karachi',
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- connected_pages: Facebook Pages the user is authorized to manage.
-- Token storage design (Phase 3): raw Page access tokens are NEVER stored in
-- this table. They live in Supabase Vault (vault.secrets); this table keeps
-- only the Vault secret id + non-sensitive metadata (last4, expiry).
-- Until Phase 3, token_vault_secret_id stays NULL.
-- --------------------------------------------------------------------------
create table public.connected_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_page_id text not null,
  page_name text not null,
  connection_method text not null check (connection_method in ('oauth', 'manual')),
  connection_status text not null default 'pending'
    check (connection_status in ('pending', 'healthy', 'needs_attention', 'needs_reauthorization', 'disconnected')),
  token_vault_secret_id uuid,
  token_last4 text,
  token_expires_at timestamptz,
  permissions_granted text[] not null default '{}',
  last_checked_at timestamptz,
  last_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, meta_page_id)
);
create index connected_pages_user_id_idx on public.connected_pages (user_id);

-- --------------------------------------------------------------------------
-- oauth_states: short-lived CSRF protection for the Meta OAuth flow (Phase 3).
-- Only the SHA-256 hash of the random state is stored — never the state itself.
-- --------------------------------------------------------------------------
create table public.oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_verifier text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_states_user_id_idx on public.oauth_states (user_id);

-- --------------------------------------------------------------------------
-- media_assets: metadata for user uploads. Bytes live in the private
-- storage bucket 'pagepilot-media' (created below); this table is the index.
-- --------------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  width integer,
  height integer,
  created_at timestamptz not null default now()
);
create index media_assets_user_id_idx on public.media_assets (user_id);

-- --------------------------------------------------------------------------
-- posts: the user's post (caption + optional media + schedule). One row per
-- post; per-Page execution lives in post_targets. Schedules stored in UTC.
-- --------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  caption text not null default '',
  media_asset_id uuid references public.media_assets(id) on delete set null,
  post_type text not null check (post_type in ('text', 'image', 'video', 'reel')),
  overall_status text not null default 'draft'
    check (overall_status in ('draft', 'scheduled', 'queued', 'processing',
                              'published', 'partially_failed', 'failed', 'cancelled')),
  scheduled_at_utc timestamptz,
  timezone text not null default 'Asia/Karachi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_user_id_idx on public.posts (user_id);
create index posts_status_idx on public.posts (overall_status);

-- --------------------------------------------------------------------------
-- post_targets: one row per (post, Page). Each target is published and
-- tracked independently so partial success is reported truthfully.
-- --------------------------------------------------------------------------
create table public.post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  connected_page_id uuid not null references public.connected_pages(id) on delete cascade,
  target_status text not null default 'scheduled'
    check (target_status in ('scheduled', 'queued', 'processing', 'published',
                             'partially_failed', 'failed', 'cancelled', 'needs_reauthorization')),
  remote_post_id text,
  remote_post_url text,
  last_error_code text,
  last_error_message text,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, connected_page_id)
);
create index post_targets_post_id_idx on public.post_targets (post_id);
create index post_targets_page_id_idx on public.post_targets (connected_page_id);

-- --------------------------------------------------------------------------
-- scheduled_jobs: the persistent queue. One job per post_target.
-- idempotency_key is globally unique: the scheduler and the publish path
-- must never create two jobs with the same key (duplicate protection).
-- --------------------------------------------------------------------------
create table public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  post_target_id uuid not null references public.post_targets(id) on delete cascade,
  run_at_utc timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'queued', 'processing', 'published', 'partially_failed',
                      'failed', 'cancelled', 'needs_reauthorization', 'dead')),
  attempt_count integer not null default 0,
  locked_at timestamptz,
  locked_by text,
  next_attempt_at timestamptz,
  idempotency_key text not null unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scheduled_jobs_due_idx on public.scheduled_jobs (status, run_at_utc)
  where status in ('scheduled', 'queued');
create index scheduled_jobs_target_idx on public.scheduled_jobs (post_target_id);

-- --------------------------------------------------------------------------
-- publish_attempts: append-only log of every execution attempt of a job.
-- Errors stored here must be SANITIZED (no tokens, no secrets) by the caller.
-- --------------------------------------------------------------------------
create table public.publish_attempts (
  id uuid primary key default gen_random_uuid(),
  scheduled_job_id uuid not null references public.scheduled_jobs(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null
    check (outcome in ('success', 'failed', 'rate_limited', 'needs_reauthorization', 'skipped_duplicate')),
  sanitized_error text,
  remote_id text
);
create index publish_attempts_job_idx on public.publish_attempts (scheduled_job_id);

-- --------------------------------------------------------------------------
-- audit_events: append-only security/operations audit trail. Never stores secrets.
-- --------------------------------------------------------------------------
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_events_user_idx on public.audit_events (user_id, created_at desc);

-- --------------------------------------------------------------------------
-- Storage: private bucket for user media. Files are private by default;
-- downloads go through signed URLs issued by the backend.
-- --------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pagepilot-media', 'pagepilot-media', false)
on conflict (id) do nothing;

-- ============================================================================
-- Row Level Security: every row is owned by exactly one auth user.
-- Tables without a direct user_id inherit ownership through their parent
-- (post_targets -> posts, scheduled_jobs -> post_targets -> posts,
--  publish_attempts -> scheduled_jobs -> ...). Service-role key bypasses RLS;
--  the scheduler and Edge Functions use it and re-verify ownership in code.
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.connected_pages enable row level security;
alter table public.oauth_states enable row level security;
alter table public.media_assets enable row level security;
alter table public.posts enable row level security;
alter table public.post_targets enable row level security;
alter table public.scheduled_jobs enable row level security;
alter table public.publish_attempts enable row level security;
alter table public.audit_events enable row level security;

-- profiles
create policy "profiles_owner_all" on public.profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

-- connected_pages
create policy "connected_pages_owner_all" on public.connected_pages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- oauth_states
create policy "oauth_states_owner_all" on public.oauth_states for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- media_assets
create policy "media_assets_owner_all" on public.media_assets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- posts
create policy "posts_owner_all" on public.posts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- post_targets (ownership via parent post)
create policy "post_targets_owner_all" on public.post_targets for all
  using (exists (
    select 1 from public.posts p
    where p.id = post_targets.post_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.posts p
    where p.id = post_targets.post_id and p.user_id = auth.uid()
  ));

-- scheduled_jobs (ownership via target -> post)
create policy "scheduled_jobs_owner_all" on public.scheduled_jobs for all
  using (exists (
    select 1 from public.post_targets t
    join public.posts p on p.id = t.post_id
    where t.id = scheduled_jobs.post_target_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.post_targets t
    join public.posts p on p.id = t.post_id
    where t.id = scheduled_jobs.post_target_id and p.user_id = auth.uid()
  ));

-- publish_attempts (ownership via job -> target -> post)
create policy "publish_attempts_owner_all" on public.publish_attempts for all
  using (exists (
    select 1 from public.scheduled_jobs j
    join public.post_targets t on t.id = j.post_target_id
    join public.posts p on p.id = t.post_id
    where j.id = publish_attempts.scheduled_job_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.scheduled_jobs j
    join public.post_targets t on t.id = j.post_target_id
    join public.posts p on p.id = t.post_id
    where j.id = publish_attempts.scheduled_job_id and p.user_id = auth.uid()
  ));

-- audit_events
create policy "audit_events_owner_all" on public.audit_events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage RLS: users can only touch objects inside their own folder (<uid>/...).
create policy "media_owner_read" on storage.objects for select
  using (bucket_id = 'pagepilot-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media_owner_insert" on storage.objects for insert
  with check (bucket_id = 'pagepilot-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media_owner_update" on storage.objects for update
  using (bucket_id = 'pagepilot-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media_owner_delete" on storage.objects for delete
  using (bucket_id = 'pagepilot-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger connected_pages_touch before update on public.connected_pages
  for each row execute function public.touch_updated_at();
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();
create trigger post_targets_touch before update on public.post_targets
  for each row execute function public.touch_updated_at();
create trigger scheduled_jobs_touch before update on public.scheduled_jobs
  for each row execute function public.touch_updated_at();
