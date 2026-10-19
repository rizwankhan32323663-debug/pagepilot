# PagePilot database migrations

Apply in numeric order, via the Supabase dashboard SQL editor or `supabase db push`.

| File | Purpose |
|---|---|
| `20261018000001_core_schema.sql` | 9 tables, indexes, RLS owner-policies, private `pagepilot-media` bucket + storage policies |
| `20261018000002_scheduler.sql` | `claim_due_jobs` (atomic, `FOR UPDATE SKIP LOCKED`) + `release_stale_locks`, locked to service-role |
| `20261018000003_vault_tokens.sql` | `user_integrations` table + Vault helper functions (`vault_store_secret`, `vault_read_secret`, `vault_delete_secret`) |
| `20261019000004_token_ciphertext.sql` | `token_ciphertext` columns for app-level AES-256-GCM encryption |

## Vault-free variant (live project)

The live Supabase project does **not** offer the `vault` Postgres extension, so
migration 0003 was applied there **without** its Vault section: the
`user_integrations` table, its RLS policy, and the `touch_updated_at` trigger
exist, but the three `vault_*` helper functions do **not** exist in the live DB.

Token encryption is therefore done **in the Edge Functions**
(`supabase/functions/_shared/crypto.ts`, AES-256-GCM via Web Crypto) with the
`TOKEN_ENCRYPTION_KEY` server env var, and ciphertext is stored in the
`token_ciphertext` columns added by migration 0004. The
`token_vault_secret_id` / `user_token_vault_id` uuid columns remain in the
schema for Vault-enabled deployments but are unused on vault-free projects.
