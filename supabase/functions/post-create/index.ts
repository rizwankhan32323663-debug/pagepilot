// post-create — POST (authenticated)
// Creates a post with one target per selected Page and one idempotent
// scheduler job per target. Entry point for the publishing engine.
// Body: {
//   "caption": string, "kind": "text"|"image"|"video"|"reel",
//   "media_asset_id"?: string|null,
//   "page_ids": string[] (connected_pages UUIDs),
//   "scheduled_at_utc"?: string|null, "timezone": string,
//   "publish_now": boolean, "save_draft"?: boolean
// }
import {
  corsHeaders,
  httpError,
  jsonResponse,
  requireUser,
  sanitizeError,
} from "../_shared/meta.ts";
import { createPostWithTargets } from "../_shared/publishing.ts";
import { SupabaseJobStore } from "../_shared/store-supabase.ts";

const KINDS = ["text", "image", "video", "reel"];

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (cors) return new Response(null, { headers: cors });
  try {
    if (req.method !== "POST") throw httpError(405, "Method not allowed");
    const user = await requireUser(req);
    const body = (await req.json()) as {
      caption?: string;
      kind?: string;
      media_asset_id?: string | null;
      page_ids?: string[];
      scheduled_at_utc?: string | null;
      timezone?: string;
      publish_now?: boolean;
    };

    const caption = (body.caption ?? "").trim();
    const kind = body.kind ?? "text";
    const pageIds = [...new Set(body.page_ids ?? [])];
    const publishNow = body.publish_now === true;
    const saveDraft = body.save_draft === true;
    const timezone = body.timezone || "Asia/Karachi";

    if (!KINDS.includes(kind)) throw httpError(400, `Invalid kind: ${kind}`);
    if (!caption && !body.media_asset_id) throw httpError(400, "A post needs a caption, media, or both.");
    if (kind !== "text" && !body.media_asset_id) throw httpError(400, `Kind "${kind}" requires a media asset.`);
    if (pageIds.length === 0) throw httpError(400, "Select at least one Page.");
    if (!publishNow && !saveDraft && !body.scheduled_at_utc) throw httpError(400, "Scheduled posts need scheduled_at_utc.");
    if (body.scheduled_at_utc && Number.isNaN(Date.parse(body.scheduled_at_utc))) {
      throw httpError(400, "scheduled_at_utc is not a valid timestamp.");
    }

    const store = new SupabaseJobStore(user.id);

    // Verify every Page and media asset belongs to this user; collect meta ids.
    const metaPageIds: string[] = [];
    for (const pid of pageIds) {
      const { data: page, error } = await store
        .raw()
        .from("connected_pages")
        .select("meta_page_id")
        .eq("id", pid)
        .eq("user_id", user.id)
        .single();
      if (error || !page) throw httpError(404, "One of the selected Pages was not found or is not yours.");
      metaPageIds.push((page as { meta_page_id: string }).meta_page_id);
    }
    if (body.media_asset_id) {
      const { data: media, error } = await store
        .raw()
        .from("media_assets")
        .select("id")
        .eq("id", body.media_asset_id)
        .eq("user_id", user.id)
        .single();
      if (error || !media) throw httpError(404, "Media asset not found or not yours.");
    }

    const { post, targets } = await createPostWithTargets(store, {
      userId: user.id,
      caption,
      mediaAssetId: body.media_asset_id ?? undefined,
      kind: kind as "text" | "image" | "video" | "reel",
      pageIds,
      metaPageIds,
      scheduledAtUtc: publishNow || saveDraft ? null : (body.scheduled_at_utc as string),
      timezone,
      publishNow,
      draft: saveDraft,
    });

    await store.raw().from("audit_events").insert({
      user_id: user.id,
      event_type: publishNow ? "post_publish_now" : saveDraft ? "post_draft" : "post_scheduled",
      target_type: "post",
      target_id: post.id,
      metadata: { kind, pages: pageIds.length },
    });

    return jsonResponse({
      post_id: post.id,
      overall_status: post.overall_status,
      targets_created: targets.length,
      jobs_created: post.overall_status === "draft" ? 0 : targets.length,
    });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    console.error("post-create failed:", sanitizeError(e));
    return jsonResponse({ error: sanitizeError(e) }, status);
  }
});
