# META_APP_SETUP.md — PagePilot Phase 3

Registers the Meta app that powers Facebook OAuth, Page discovery, and publishing.
~20 minutes + waiting time for reviews (if needed). No payment required.

## 1. Create the Meta app

1. Go to https://developers.facebook.com/apps → **Create App**.
2. Choose **Business** type (needed for Page management APIs).
3. Name: `PagePilot`. Contact email: your email.
4. Note the **App ID** and **App Secret** (Settings → Basic). The secret goes
   ONLY into the Edge Function environment — never into frontend code or git.

## 2. Add Facebook Login

1. In the app dashboard: **Add Product → Facebook Login → Set up**.
2. **Valid OAuth Redirect URIs** — add exactly:
   ```
   https://<your-project-ref>.supabase.co/functions/v1/oauth-callback
   ```
   This must match `META_REDIRECT_URI` character-for-character.

## 3. Request permissions

PagePilot needs the minimum set:
- `pages_show_list` — list Pages you manage
- `pages_read_engagement` — read Page metadata
- `pages_manage_posts` — publish posts

Where to request: **App Review → Permissions and Features** → request each one.
You will be asked what the app does and may need to provide a screencast and
privacy policy URL.

### Dev mode vs App Review — read this first

| Situation | What works |
|---|---|
| App in **Development mode**, and YOU have a role on the app (Admin/Developer/Tester) | Full OAuth + publishing on **your own Pages**, no review needed. This is the fastest path for personal use. |
| Any OTHER person connects their Pages | Requires **App Review** approval for the permissions above, plus possibly Business Verification. Review can take days and can be rejected — plan for it. |

**Recommendation:** add yourself as Admin, keep the app in Development mode while
building, and only pursue App Review if/when someone else needs to connect Pages.

## 4. Configure the Edge Functions

1. Deploy the functions:
   ```bash
   supabase functions deploy oauth-start oauth-callback pages-list token-import page-disconnect
   ```
2. Set secrets (dashboard → Edge Functions → Manage secrets, or CLI):
   ```bash
   supabase secrets set \
     META_APP_ID=<app-id> \
     META_APP_SECRET=<app-secret> \
     META_REDIRECT_URI=https://<ref>.supabase.co/functions/v1/oauth-callback \
     APP_URL=<your-frontend-url> \
     TOKEN_ENCRYPTION_KEY=<64-hex-chars>
   ```
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are
   provided to functions automatically. `TOKEN_ENCRYPTION_KEY` is REQUIRED —
   the live project has no Vault extension, so tokens are encrypted app-side;
   see `supabase/migrations/README.md`.)
3. Apply migrations in order (`supabase/migrations/`). NOTE: the live project
   has no `vault` Postgres extension, so apply
   `20261018000003_vault_tokens.sql` WITHOUT its Vault-helper section
   (keep the `user_integrations` table + RLS + trigger), then apply
   `20261019000004_token_ciphertext.sql` for the app-level encryption columns.

## 5. Test the flow (no real posts published)

1. Sign in to PagePilot → **Add Page → Continue with Facebook**.
2. Approve on facebook.com, select a **test Page** (create one at
   facebook.com/pages/create if you don't want to touch a real Page).
3. You should land back on **Connected Pages** with the Page listed as healthy.
4. **Manual token path:** paste a Page token from the
   [Graph API Explorer](https://developers.facebook.com/tools/explorer/) →
   **Validate & Add Page**. An invalid token must be rejected with a clear error;
   the token must never appear in any log or response.

## 6. Token lifetime reality

- User tokens: long-lived ≈ **60 days**, then re-login is required.
- Page tokens obtained via a long-lived user token: long-lived (no fixed expiry
  published by Meta, but they die if the user changes their password, removes
  the app, or the Page role changes).
- PagePilot stores `token_expires_at` where Meta reports it and the Diagnostics
  + Connected Pages screens surface **needs_reauthorization** when publishing
  fails with OAuth errors. There is no silent auto-refresh for Page tokens —
  reconnection is a deliberate user action.

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Invalid redirect_uri" on facebook.com | `META_REDIRECT_URI` ≠ the URI registered in Facebook Login settings — must match exactly |
| OAuth succeeds but 0 Pages listed | The Meta user has no Page role, or `pages_show_list` wasn't granted |
| `debug_token` says invalid | Token pasted wrong, expired, or belongs to a different app |
| "missing required permissions" on import | Token lacks one of the 3 scopes — generate it with all scopes checked |
| Callback 500 | Check function logs: `supabase functions logs oauth-callback` — secrets missing is the usual cause |
