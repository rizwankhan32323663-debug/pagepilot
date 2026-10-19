// page-disconnect — POST (authenticated)
// Disconnects ONE Page: removes ONLY that connected_pages row. The token
// ciphertext dies with the row — nothing external to purge. Other Pages,
// posts, jobs, and logs are untouched.
// Body: { "connected_page_id": "<uuid>" }
import {
  corsHeaders,
  httpError,
  jsonResponse,
  requireUser,
  sanitizeError,
  serviceClient,
} from "../_shared/meta.ts";

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (cors) return new Response(null, { headers: cors });
  try {
    if (req.method !== "POST") throw httpError(405, "Method not allowed");
    const user = await requireUser(req);
    const body = (await req.json()) as { connected_page_id?: string };
    const pageRowId = (body.connected_page_id ?? "").trim();
    if (!pageRowId) throw httpError(400, "Missing connected_page_id");

    const db = serviceClient();
    const { data: row, error: rowErr } = await db
      .from("connected_pages")
      .select("id, meta_page_id, page_name")
      .eq("id", pageRowId)
      .eq("user_id", user.id) // ownership re-verified: service_role bypasses RLS
      .single();
    if (rowErr || !row) throw httpError(404, "Page connection not found");

    const { error: delErr } = await db.from("connected_pages").delete().eq("id", row.id).eq("user_id", user.id);
    if (delErr) throw httpError(500, "Could not disconnect the Page");

    await db.from("audit_events").insert({
      user_id: user.id,
      event_type: "page_disconnected",
      target_type: "connected_page",
      target_id: row.meta_page_id,
      metadata: { page_name: row.page_name },
    });

    return jsonResponse({ disconnected: row.meta_page_id, page_name: row.page_name });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    console.error("page-disconnect failed:", sanitizeError(e));
    return jsonResponse({ error: sanitizeError(e) }, status);
  }
});
