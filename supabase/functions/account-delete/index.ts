// account-delete — POST (authenticated)
// IRREVERSIBLE: deletes the user's storage objects, all rows (token
// ciphertext dies with its rows — nothing external to purge), and finally
// the auth user. Requires { "confirm": "DELETE" } — anything else
// is rejected. Each step is ownership-scoped; failures abort with a clear
// error instead of leaving a half-deleted account unnoticed.
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
    const body = (await req.json()) as { confirm?: string };
    if (body.confirm !== "DELETE") {
      throw httpError(400, 'Confirmation required: send { "confirm": "DELETE" }');
    }

    const db = serviceClient();
    const fail = (step: string, detail: unknown): never => {
      throw httpError(500, `Account deletion stopped at step "${step}": ${sanitizeError(detail)}`);
    };

    // 1. Token ciphertext lives inside connected_pages / user_integrations rows
    //    and is destroyed with those rows in step 3. Nothing external to purge.

    // 2. Delete storage objects under the user's folder.
    const { data: objects, error: listErr } = await db.storage.from("pagepilot-media").list(user.id);
    if (listErr) fail("list storage objects", listErr);
    if (objects && objects.length > 0) {
      const paths = objects.map((o: { name: string }) => `${user.id}/${o.name}`);
      const { error } = await db.storage.from("pagepilot-media").remove(paths);
      if (error) fail("remove storage objects", error);
    }

    // 3. Delete rows. Order matters: children first (FK cascades handle most,
    //    but explicit deletes make the audit trail deterministic).
    const deletes: Array<[string, string]> = [
      ["publish_attempts (via cascade)", "posts"],
      ["media_assets", "media_assets"],
      ["connected_pages", "connected_pages"],
      ["oauth_states", "oauth_states"],
      ["audit_events", "audit_events"],
      ["user_integrations", "user_integrations"],
      ["profiles", "profiles"],
    ];
    // posts cascade: post_targets -> scheduled_jobs -> publish_attempts
    for (const [label, table] of deletes) {
      const col = table === "profiles" ? "id" : "user_id";
      const { error } = await db.from(table).delete().eq(col, user.id);
      if (error) fail(`delete ${label}`, error);
    }

    // 4. Delete the auth user itself.
    const { error: authErr } = await db.auth.admin.deleteUser(user.id);
    if (authErr) fail("delete auth user", authErr);

    return jsonResponse({ deleted: true });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    console.error("account-delete failed:", sanitizeError(e));
    return jsonResponse({ error: sanitizeError(e) }, status);
  }
});
