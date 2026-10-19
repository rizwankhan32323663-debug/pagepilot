// token-import — POST (authenticated)
// Optional manual import of a Page access token obtained legitimately
// through Meta. The backend validates server-side via debug_token, checks
// required permissions, identifies the Page, encrypts the token (AES-256-GCM)
// and stores ONLY the ciphertext. The token is never logged and never returned.
// Body: { "token": "<page access token>" }
import {
  corsHeaders,
  httpError,
  jsonResponse,
  metaEnv,
  metaGet,
  requireUser,
  sanitizeError,
  serviceClient,
} from "../_shared/meta.ts";
import { missingScopes, REQUIRED_META_SCOPES } from "../_shared/core.ts";
import { encryptToken, loadEncryptionKey } from "../_shared/crypto.ts";

interface DebugTokenResponse {
  data: {
    is_valid: boolean;
    scopes?: string[];
    profile_id?: string;
    expires_at?: number;
    error?: { message: string };
  };
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (cors) return new Response(null, { headers: cors });
  try {
    if (req.method !== "POST") throw httpError(405, "Method not allowed");
    const user = await requireUser(req);
    const { appId, appSecret } = metaEnv();
    const body = (await req.json()) as { token?: string };
    const token = (body.token ?? "").trim();
    if (!token) throw httpError(400, "Missing token");

    // 1. Validate with debug_token (app token authenticates the call).
    //    The submitted token itself is never written to any log.
    const debug = await metaGet<DebugTokenResponse>("/debug_token", `${appId}|${appSecret}`, {
      input_token: token,
    });
    const info = debug.data;
    if (!info?.is_valid) {
      throw httpError(400, `Token invalid: ${info?.error?.message ?? "Meta rejected the token"}`);
    }

    // 2. Check required permissions.
    const missing = missingScopes(info.scopes);
    if (missing.length > 0) {
      throw httpError(403, `Token is missing required permissions: ${missing.join(", ")}`);
    }

    // 3. Identify the Page this token belongs to.
    const page = await metaGet<{ id: string; name: string }>("/me", token, { fields: "id,name" });
    if (!info.profile_id || info.profile_id !== page.id) {
      throw httpError(400, "This token does not belong to a Facebook Page (user tokens cannot be imported here).");
    }

    // 4. Encrypt and register the Page. Only metadata + ciphertext persisted.
    const db = serviceClient();
    const cipher = await encryptToken(token, loadEncryptionKey());

    const { error: upsertErr } = await db.from("connected_pages").upsert(
      {
        user_id: user.id,
        meta_page_id: page.id,
        page_name: page.name,
        connection_method: "manual",
        connection_status: "healthy",
        token_ciphertext: cipher,
        token_last4: token.slice(-4),
        token_expires_at: info.expires_at ? new Date(info.expires_at * 1000).toISOString() : null,
        permissions_granted: (info.scopes ?? []).filter((s) => REQUIRED_META_SCOPES.includes(s)),
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,meta_page_id" },
    );
    if (upsertErr) throw httpError(500, "Could not register the Page");

    await db.from("audit_events").insert({
      user_id: user.id,
      event_type: "page_connected_manual",
      target_type: "connected_page",
      target_id: page.id,
      metadata: { page_name: page.name, method: "manual" },
    });

    // NEVER return the token.
    return jsonResponse({ page_id: page.id, page_name: page.name, method: "manual" });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    console.error("token-import failed:", sanitizeError(e));
    return jsonResponse({ error: sanitizeError(e) }, status);
  }
});
