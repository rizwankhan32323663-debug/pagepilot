// pages-list — GET (authenticated)
// Re-lists the Pages the user manages, using the stored Meta user token.
// Used by the "select Pages" step of the OAuth flow and by health checks.
import {
  corsHeaders,
  httpError,
  jsonResponse,
  metaGet,
  requireUser,
  sanitizeError,
  serviceClient,
} from "../_shared/meta.ts";
import { decryptToken, loadEncryptionKey } from "../_shared/crypto.ts";

interface AccountsResponse {
  data: Array<{ id: string; name: string; perms?: string[] }>;
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (cors) return new Response(null, { headers: cors });
  try {
    if (req.method !== "GET") throw httpError(405, "Method not allowed");
    const user = await requireUser(req);
    const db = serviceClient();

    const { data: integ, error: integErr } = await db
      .from("user_integrations")
      .select("user_token_ciphertext")
      .eq("user_id", user.id)
      .single();
    if (integErr || !integ?.user_token_ciphertext) {
      throw httpError(409, "No Meta connection yet — connect with Facebook first (OAuth).");
    }
    let userToken: string;
    try {
      userToken = await decryptToken(integ.user_token_ciphertext as string, loadEncryptionKey());
    } catch {
      throw httpError(502, "Could not read stored Meta token");
    }

    const accounts = await metaGet<AccountsResponse>("/me/accounts", userToken, {
      fields: "id,name,perms",
      limit: "100",
    });

    const { data: connected } = await db
      .from("connected_pages")
      .select("meta_page_id")
      .eq("user_id", user.id);
    const connectedIds = new Set((connected ?? []).map((r: { meta_page_id: string }) => r.meta_page_id));

    return jsonResponse({
      pages: (accounts.data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        perms: p.perms ?? [],
        already_connected: connectedIds.has(p.id),
      })),
    });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    console.error("pages-list failed:", sanitizeError(e));
    return jsonResponse({ error: sanitizeError(e) }, status);
  }
});
