-- ============================================================================
-- PagePilot migration 0002 — scheduler primitives (Phase 5)
-- Atomic job claiming so two workers can never process the same job.
-- Pattern: SELECT ... FOR UPDATE SKIP LOCKED inside a CTE, then UPDATE.
-- Only the service_role may execute this function (the scheduler runs with
-- the service-role key and re-verifies row ownership in application code).
-- ============================================================================

create or replace function public.claim_due_jobs(p_limit int default 10, p_worker text default 'worker')
returns setof public.scheduled_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select j.id
    from public.scheduled_jobs j
    where j.status in ('scheduled', 'queued')
      and j.run_at_utc <= now()
      and (j.next_attempt_at is null or j.next_attempt_at <= now())
    order by j.run_at_utc asc
    limit p_limit
    for update skip locked
  )
  update public.scheduled_jobs j
  set status = 'processing',
      locked_at = now(),
      locked_by = p_worker,
      attempt_count = j.attempt_count + 1,
      updated_at = now()
  from due
  where j.id = due.id
  returning j.*;
end;
$$;

-- Lock down: only service_role (scheduler / Edge Functions) may claim jobs.
revoke all on function public.claim_due_jobs(int, text) from public, anon, authenticated;

-- Stale-lock recovery helper: jobs stuck in 'processing' longer than the
-- given interval are assumed to belong to a dead worker and released back
-- to 'queued' for re-claiming. Run periodically from the scheduler.
create or replace function public.release_stale_locks(p_stale_interval interval default interval '15 minutes')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released int;
begin
  update public.scheduled_jobs
  set status = 'queued',
      locked_at = null,
      locked_by = null,
      next_attempt_at = now() + interval '1 minute',
      updated_at = now()
  where status = 'processing'
    and locked_at < now() - p_stale_interval;
  get diagnostics v_released = row_count;
  return v_released;
end;
$$;

revoke all on function public.release_stale_locks(interval) from public, anon, authenticated;
