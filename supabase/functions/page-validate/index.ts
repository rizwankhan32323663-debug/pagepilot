// page-validate — POST (authenticated)
// Independently re-validates ONE Page connection: decrypts the stored token
// (never returned), checks it with debug_token, refreshes permissions/status,
// and stamps last_checked_at. Body: { "connected_page_id": "<uuid>" }
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
import { decryptToken, loadEncryptionKey } from "../_shared/crypto.ts";

interface DebugTokenResponse {
  data: { is_valid: boolean; scopes?: string[]; error?: { message?: string } };
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (cors) return new Response(null, { headers: cors });
  try {
    if (req.method !== "POST") throw httpError(405, "Method not allowed");
    const user = await requireUser(req);
    const { appId, appSecret } = metaEnv();
    const body = (await req.json()) as { connected_page_id?: string };
    const rowId = (body.connected_page_id ?? "").trim();
    if (!rowId) throw httpError(400, "Missing connected_page_id");

    const db = serviceClient();
    const { data: row, error: rowErr } = await db
      .from("connected_pages")
      .select("id, meta_page_id, page_name, token_ciphertext")
      .eq("id", rowId)
      .eq("user_id", user.id)
      .single();
    if (rowErr || !row) throw httpError(404, "Page connection not found");
    const page = row as { id: string; meta_page_id: string; page_name: string; token_ciphertext: string | null };
    if (!page.token_ciphertext) throw httpError(409, "No stored token for this Page — reconnect it.");

    let token: string;
    try {
      token = await decryptToken(page.token_ciphertext, loadEncryptionKey());
    } catch {
      throw httpError(502, "Could not read the stored token.");
    }

    const debug = await metaGet<DebugTokenResponse>("/debug_token", `${appId}|${appSecret}`, {
      input_token: token as string,
    }).catch(() => null);

    const valid = debug?.data?.is_valid === true;
    const status = valid ? "healthy" : "needs_reauthorization";
    const { error: updErr } = await db
      .from("connected_pages")
      .update({
        connection_status: status,
        permissions_granted: debug?.data?.scopes ?? [],
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", page.id)
      .eq("user_id", user.id);
    if (updErr) throw httpError(500, "Could not update Page status.");

    return jsonResponse({
      page_id: page.meta_page_id,
      page_name: page.page_name,
      connection_status: status,
      valid,
    });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    console.error("page-validate failed:", sanitizeError(e));
    return jsonResponse({ error: sanitizeError(e) }, status);
  }
});
