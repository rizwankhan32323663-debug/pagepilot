// oauth-start — POST (authenticated)
// Creates a CSRF state, stores only its SHA-256 hash, and returns the
// Meta OAuth dialog URL. The browser redirects there; Meta calls back
// to oauth-callback with ?code&state.
import {
  corsHeaders,
  httpError,
  jsonResponse,
  metaEnv,
  randomState,
  requiredScopes,
  requireUser,
  sanitizeError,
  serviceClient,
  sha256Hex,
} from "../_shared/meta.ts";

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (cors) return new Response(null, { headers: cors });
  try {
    if (req.method !== "POST") throw httpError(405, "Method not allowed");
    const user = await requireUser(req);
    const { appId, redirectUri } = metaEnv();

    const state = randomState(32);
    const stateHash = await sha256Hex(state);
    const db = serviceClient();
    const { error } = await db.from("oauth_states").insert({
      state_hash: stateHash,
      user_id: user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) throw httpError(500, "Could not create OAuth state");

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      scope: requiredScopes().join(","),
      response_type: "code",
    });
    const url = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
    return jsonResponse({ url });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    console.error("oauth-start failed:", sanitizeError(e));
    return jsonResponse({ error: sanitizeError(e) }, status);
  }
});
