// publish-worker — invoked by the persistent scheduler (Supabase Cron via
// pg_net, or a manual POST for ops). Claims due jobs per user and publishes
// each target through the Meta Graph API. NOT live-tested (no Supabase/Meta
// credentials in this environment) — see DEPLOY.md for the cron setup.
//
// Routing: text/image → MetaLiveClient; video/reel → VideoMetaClient backed
// by MetaVideoTransport, whose bytes come from the private Supabase Storage
// bucket (ownership re-verified per row).
//
// Security: service-role key; each user's jobs are processed with a
// SupabaseJobStore bound to that user_id (ownership re-verified per row).
// Invoke with the service-role key in Authorization header.
import { runSchedulerTick } from "../_shared/scheduler.ts";
import { MetaLiveClient } from "../_shared/meta-live.ts";
import { MetaVideoTransport, VideoMetaClient } from "../_shared/video.ts";
import { SupabaseJobStore } from "../_shared/store-supabase.ts";
import type { MetaClient, PublishInput, PublishResult } from "../_shared/core.ts";

interface Ctx {
  store: SupabaseJobStore;
  userId: string;
}

/** Load a media asset's bytes from private storage (ownership-checked). */
async function loadMediaBytes(
  ctx: Ctx,
  mediaAssetId: string,
): Promise<{ fileSize: number; provider: (offset: number, length: number) => Promise<Uint8Array> }> {
  const { data: asset, error } = await ctx.store
    .raw()
    .from("media_assets")
    .select("storage_path, file_size")
    .eq("id", mediaAssetId)
    .eq("user_id", ctx.userId)
    .single();
  if (error || !asset) throw new Error("Media asset not found or not owned by user");
  const row = asset as { storage_path: string; file_size: number };
  const { data: blob, error: dlErr } = await ctx.store.raw().storage.from("pagepilot-media").download(row.storage_path);
  if (dlErr || !blob) throw new Error(`Could not download media: ${dlErr?.message ?? "unknown"}`);
  const buf = new Uint8Array(await (blob as Blob).arrayBuffer());
  return {
    fileSize: buf.length,
    provider: async (offset: number, length: number) => buf.slice(offset, offset + length),
  };
}

/**
 * Routes each publish by kind. The scheduler interface stays single-shot;
 * video/reel get a dedicated VideoMetaClient built per job from the post's
 * media asset (post id is parsed from the idempotency key `pp:<postId>:<pageId>`).
 */
class RoutingMetaClient implements MetaClient {
  private textImage = new MetaLiveClient();
  constructor(private ctx: Ctx) {}

  async publish(input: PublishInput, token: string): Promise<PublishResult> {
    if (input.kind !== "video" && input.kind !== "reel") {
      return this.textImage.publish(input, token);
    }
    const postId = input.idempotencyKey.split(":")[1];
    const post = await this.ctx.store.getPost(postId);
    if (!post?.media_asset_id) {
      return { ok: false, errorCode: "100", errorMessage: "Video/reel post has no media asset.", retryable: false };
    }
    const { fileSize, provider } = await loadMediaBytes(this.ctx, post.media_asset_id);
    const videoClient = new VideoMetaClient(new MetaVideoTransport(provider), {
      fileSizeBytes: fileSize,
      onProgress: () => {}, // progress surfaced to UI in Phase 7
    });
    return videoClient.publish(input, token);
  }
}

Deno.serve(async (req: Request) => {
  try {
    const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const got = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!expected || got !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const workerId = `cron-${new Date().toISOString()}`;
    const summary: Record<string, unknown> = { worker: workerId, users: {} };

    // Fan out per user so one user's jobs never touch another's rows.
    const userIds = await SupabaseJobStore.userIdsWithDueJobs();
    for (const userId of userIds) {
      const store = new SupabaseJobStore(userId);
      const ctx: Ctx = { store, userId };
      const tick = await runSchedulerTick({
        store,
        client: new RoutingMetaClient(ctx),
        getPageToken: (connectedPageId: string) => store.readPageToken(connectedPageId),
        workerId: `${workerId}:${userId.slice(0, 8)}`,
        claimLimit: 10,
      });
      (summary.users as Record<string, unknown>)[userId.slice(0, 8)] = tick;
    }

    // Release locks left by crashed workers so their jobs get re-claimed.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: released } = await admin.rpc("release_stale_locks", {});
    summary.stale_locks_released = released ?? 0;

    return new Response(JSON.stringify(summary), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("publish-worker failed:", msg.slice(0, 500));
    return new Response(JSON.stringify({ error: msg.slice(0, 500) }), { status: 500 });
  }
});
