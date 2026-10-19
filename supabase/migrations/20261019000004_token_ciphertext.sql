-- ============================================================================
-- PagePilot migration 0004 — app-level token encryption (AES-256-GCM).
--
-- The live Supabase project does NOT offer the `vault` Postgres extension,
-- so migration 0003 was applied there as a VAULT-FREE variant: the
-- user_integrations table + RLS + trigger exist, but the
-- vault_store_secret / vault_read_secret / vault_delete_secret helper
-- functions were never created.
--
-- Tokens are therefore encrypted in the Edge Functions with the
-- TOKEN_ENCRYPTION_KEY server env var (64 hex chars) and stored as
-- ciphertext blobs ("base64(iv):base64(ciphertext)") in the columns below.
-- The *_vault_*_id uuid columns are kept for schema compatibility with
-- Vault-enabled deployments but are UNUSED on vault-free projects.
-- ============================================================================

alter table public.connected_pages
  add column if not exists token_ciphertext text;

alter table public.user_integrations
  add column if not exists token_ciphertext text;

comment on column public.connected_pages.token_ciphertext is
  'AES-256-GCM ciphertext of the Page access token (base64(iv):base64(ct)); key = TOKEN_ENCRYPTION_KEY env var';
comment on column public.user_integrations.token_ciphertext is
  'AES-256-GCM ciphertext of the Meta user token (base64(iv):base64(ct)); key = TOKEN_ENCRYPTION_KEY env var';
