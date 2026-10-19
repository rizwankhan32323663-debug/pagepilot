// oauth-callback — GET (called by Meta, no session available)
// Validates the OAuth state (hash lookup, expiry, single-use), exchanges the
// code server-side, upgrades to a long-lived user token, lists /me/accounts,
// and stores every Page's token ENCRYPTED (AES-256-GCM, key in
// TOKEN_ENCRYPTION_KEY). Redirects back to the app.
// NOTE: never reached in local dev without a real Meta app — see META_APP_SETUP.md.
import {
  httpError,
  metaEnv,
  metaGet,
  redirectResponse,
  sanitizeError,
  serviceClient,
  sha256Hex,
} from "../_shared/meta.ts";
import { isOAuthStateUsable } from "../_shared/core.ts";
import { encryptToken, loadEncryptionKey } from "../_shared/crypto.ts";

interface AccountsResponse {
  data: Array<{ id: string; name: string; access_token: string; perms?: string[] }>;
}

Deno.serve(async (req: Request) => {
  const fail = (appUrl: string, reason: string) =>
    redirectResponse(`${appUrl}/pages/add?oauth=error&reason=${encodeURIComponent(reason)}`);
  try {
    const { appId, appSecret, redirectUri, appUrl } = metaEnv();
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errReason = url.searchParams.get("error_reason");
    if (errReason) return fail(appUrl, `Facebook returned: ${errReason}`);
    if (!code || !state) return fail(appUrl, "Missing code or state in callback");

    const db = serviceClient();
    const stateHash = await sha256Hex(state);
    const { data: stateRow, error: stateErr } = await db
      .from("oauth_states")
      .select("user_id, expires_at, used_at")
      .eq("state_hash", stateHash)
      .single();
    const usability = !stateErr ? isOAuthStateUsable(stateRow as { expires_at: string; used_at: string | null }, Date.now()) : { ok: false, reason: "Unknown OAuth state" };
    if (!usability.ok) return fail(appUrl, usability.reason ?? "Invalid OAuth state");
    await db.from("oauth_states").update({ used_at: new Date().toISOString() }).eq("state_hash", stateHash);
    const userId = stateRow.user_id as string;

    // 1. Code -> short-lived user token (server-side; secret never leaves here)
    const tokenRes = await metaGet<{ access_token: string }>(
      "/oauth/access_token",
      `${appId}|${appSecret}`, // app token authenticates this call; no user secret involved
      {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      },
    );

    // 2. Upgrade to long-lived user token (~60 days)
    const longRes = await metaGet<{ access_token: string; expires_in: number }>("/oauth/access_token", tokenRes.access_token, {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: tokenRes.access_token,
    });
    const userToken = longRes.access_token;
    const userTokenExpires = new Date(Date.now() + (longRes.expires_in ?? 5184000) * 1000).toISOString();

    // 3. Who is this Meta user?
    const me = await metaGet<{ id: string }>("/me", userToken, { fields: "id" });

    // 4. Pages they manage (page tokens from a long-lived user token are long-lived)
    const accounts = await metaGet<AccountsResponse>("/me/accounts", userToken, {
      fields: "id,name,access_token,perms",
      limit: "100",
    });

    // 5. Store the user token encrypted (for future Page re-discovery).
    //    Live DB has no Vault extension: ciphertext goes in the row itself.
    const encKey = loadEncryptionKey();
    const userCipher = await encryptToken(userToken, encKey);
    const { error: integErr } = await db.from("user_integrations").upsert({
      user_id: userId,
      provider: "meta",
      user_token_ciphertext: userCipher,
      user_token_expires_at: userTokenExpires,
      meta_user_id: me.id,
    });
    if (integErr) throw httpError(500, "Could not save the Meta connection");

    // 6. Store each Page + its encrypted token; upsert connected_pages.
    let connected = 0;
    for (const page of accounts.data ?? []) {
      let cipher: string;
      try {
        cipher = await encryptToken(page.access_token, encKey);
      } catch (e) {
        console.error("oauth-callback: token encryption failed for page", page.id, sanitizeError(e));
        continue;
      }
      const { error: upsertErr } = await db.from("connected_pages").upsert(
        {
          user_id: userId,
          meta_page_id: page.id,
          page_name: page.name,
          connection_method: "oauth",
          connection_status: "healthy",
          token_ciphertext: cipher,
          permissions_granted: page.perms ?? [],
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,meta_page_id" },
      );
      if (upsertErr) {
        console.error("oauth-callback: page upsert failed", page.id, sanitizeError(upsertErr));
        continue;
      }
      connected++;
    }

    return redirectResponse(`${appUrl}/pages?oauth=success&connected=${connected}`);
  } catch (e) {
    console.error("oauth-callback failed:", sanitizeError(e));
    try {
      const { appUrl } = metaEnv();
      return fail(appUrl, sanitizeError(e));
    } catch {
      return new Response("OAuth callback failed (server misconfigured).", { status: 500 });
    }
  }
});
