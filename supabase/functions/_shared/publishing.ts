// Publishing orchestration: validate input, create one post + one target per
// Page + one idempotent job per target. Zero runtime imports.
import { nowIso, type PostKind, type PostOverallStatus, type TargetStatus } from "./core.ts";
import type { DbTarget, JobStore } from "./store.ts";

export interface CreatePostArgs {
  userId: string;
  caption: string;
  mediaAssetId?: string;
  kind: PostKind;
  /** connected_pages ids (UUIDs) the post should go to. */
  pageIds: string[];
  /** Meta Page IDs aligned with pageIds (same order). */
  metaPageIds: string[];
  scheduledAtUtc: string | null; // null = draft (or publish-now when publishNow)
  timezone: string;
  publishNow: boolean;
  /** Save as draft: no targets become jobs. */
  draft?: boolean;
}

export function idempotencyKey(postId: string, metaPageId: string): string {
  return `pp:${postId}:${metaPageId}`;
}

function validateArgs(args: CreatePostArgs): void {
  if (!args.userId) throw new Error("userId is required");
  if (!args.caption.trim() && !args.mediaAssetId) {
    throw new Error("A post needs a caption, media, or both.");
  }
  if (args.kind !== "text" && !args.mediaAssetId) {
    throw new Error(`Post kind "${args.kind}" requires an attached media asset.`);
  }
  if (args.pageIds.length === 0) throw new Error("Select at least one Page.");
  if (args.pageIds.length !== args.metaPageIds.length) throw new Error("pageIds/metaPageIds mismatch");
  if (!args.publishNow && args.scheduledAtUtc) {
    if (new Date(args.scheduledAtUtc).getTime() <= Date.now()) {
      throw new Error("Scheduled time must be in the future.");
    }
  }
  if (!args.publishNow && !args.draft && !args.scheduledAtUtc) throw new Error("Scheduled posts need scheduledAtUtc");
}

export async function createPostWithTargets(store: JobStore, args: CreatePostArgs) {
  validateArgs(args);
  const uniquePages = [...new Set(args.pageIds)];
  const overall: PostOverallStatus = args.draft ? "draft" : args.publishNow ? "queued" : args.scheduledAtUtc ? "scheduled" : "draft";

  const post = await store.createPost({
    user_id: args.userId,
    caption: args.caption.trim(),
    media_asset_id: args.mediaAssetId ?? null,
    post_type: args.kind,
    overall_status: overall,
    scheduled_at_utc: args.publishNow ? nowIso() : args.scheduledAtUtc,
    timezone: args.timezone,
  });

  const targets: DbTarget[] = [];
  for (let i = 0; i < uniquePages.length; i++) {
    const pageId = uniquePages[i];
    const metaPageId = args.metaPageIds[args.pageIds.indexOf(pageId)];
    const target = await store.createTarget({
      post_id: post.id,
      connected_page_id: pageId,
      meta_page_id: metaPageId,
      target_status: (overall === "draft" ? "scheduled" : overall) as TargetStatus,
    });
    targets.push(target);
    if (overall !== "draft") {
      await store.createJob({
        post_target_id: target.id,
        run_at_utc: post.scheduled_at_utc as string,
        status: overall === "queued" ? "queued" : "scheduled",
        idempotency_key: idempotencyKey(post.id, metaPageId),
      });
    }
  }
  return { post, targets };
}

/** Roll up per-target outcomes into the post's overall status — truthfully. */
export function rollupStatus(targets: Pick<DbTarget, "target_status">[]): PostOverallStatus {
  const s = targets.map((t) => t.target_status);
  if (s.length === 0) return "draft";
  if (s.every((x) => x === "published")) return "published";
  if (s.every((x) => x === "failed" || x === "cancelled")) return "failed";
  if (s.some((x) => x === "published")) return "partially_failed";
  if (s.some((x) => x === "processing" || x === "queued")) return "processing";
  if (s.some((x) => x === "scheduled")) return "scheduled";
  return "failed";
}
