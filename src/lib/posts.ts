import { isSupabaseConfigured } from "./supabase";
import { callFunction } from "./meta";
import { zonedTimeToUtc } from "./core";

/** Post creation — Phase 7/8. Calls the post-create Edge Function (server-side validation + idempotent job creation). */

export type NewPostKind = "text" | "image" | "video" | "reel";

export interface NewPostInput {
  caption: string;
  kind: NewPostKind;
  mediaAssetId?: string;
  pageIds: string[];
  /** Wall-clock "YYYY-MM-DDTHH:mm" in the given timezone; null for draft/publish-now. */
  scheduleLocal: string | null;
  timezone: string;
  publishNow: boolean;
  saveDraft: boolean;
}

export interface NewPostResult {
  post_id: string;
  overall_status: string;
  targets_created: number;
  jobs_created: number;
}

export async function createNewPost(input: NewPostInput): Promise<NewPostResult> {
  if (!isSupabaseConfigured()) throw new Error("Post creation needs Supabase (Phase 2 setup).");
  if (!input.caption.trim() && !input.mediaAssetId) throw new Error("A post needs a caption, media, or both.");
  if (input.pageIds.length === 0) throw new Error("Select at least one Page.");
  let scheduledAtUtc: string | null = null;
  if (!input.publishNow && !input.saveDraft) {
    if (!input.scheduleLocal) throw new Error("Pick a date and time to schedule the post.");
    scheduledAtUtc = zonedTimeToUtc(input.scheduleLocal, input.timezone);
    if (new Date(scheduledAtUtc).getTime() <= Date.now()) throw new Error("Scheduled time must be in the future.");
  }
  return callFunction<NewPostResult>("/post-create", {
    caption: input.caption.trim(),
    kind: input.kind,
    media_asset_id: input.mediaAssetId ?? null,
    page_ids: input.pageIds,
    scheduled_at_utc: scheduledAtUtc,
    timezone: input.timezone,
    publish_now: input.publishNow,
    save_draft: input.saveDraft,
  });
}
