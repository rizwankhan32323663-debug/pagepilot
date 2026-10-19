-- ============================================================================
-- PagePilot migration 0003 — user integrations + Vault token helpers (Phase 3)
-- Raw Meta tokens are stored ONLY in Supabase Vault (vault.secrets).
-- Application tables keep the Vault secret id. These SECURITY DEFINER helpers
-- are the only path to write/read/delete secrets; they are revoked from all
-- client roles, so only the service_role (Edge Functions / scheduler) can
-- call them. Requires the `vault` extension (available on hosted Supabase).
-- ============================================================================

create extension if not exists "vault" with schema "vault";

-- --------------------------------------------------------------------------
-- user_integrations: the Meta USER token (long-lived) per PagePilot user.
-- Needed to re-list /me/accounts (Page discovery) without a new OAuth dance.
-- --------------------------------------------------------------------------
create table public.user_integrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'meta',
  user_token_vault_id uuid,
  user_token_expires_at timestamptz,
  meta_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_integrations enable row level security;
create policy "user_integrations_owner_all" on public.user_integrations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger user_integrations_touch before update on public.user_integrations
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------------------
-- Vault helpers. SECURITY DEFINER + fixed search_path. Revoked from
-- public/anon/authenticated: only service_role executes them.
-- --------------------------------------------------------------------------

create or replace function public.vault_store_secret(p_secret text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if p_secret is null or length(p_secret) = 0 then
    raise exception 'vault_store_secret: empty secret refused';
  end if;
  insert into vault.secrets (secret, name, description)
  values (p_secret, p_name, 'PagePilot Meta token')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.vault_store_secret(text, text) from public, anon, authenticated;

create or replace function public.vault_read_secret(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where id = p_id;
  return v_secret;
end;
$$;
revoke all on function public.vault_read_secret(uuid) from public, anon, authenticated;

create or replace function public.vault_delete_secret(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  delete from vault.secrets where id = p_id;
end;
$$;
revoke all on function public.vault_delete_secret(uuid) from public, anon, authenticated;
