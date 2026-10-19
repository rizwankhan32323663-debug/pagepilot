// Scheduler worker: claim due jobs atomically, publish each target through the
// MetaClient, handle partial success, reconcile-before-retry, exponential
// backoff, and dead-lettering. Zero runtime imports.
import {
  MAX_ATTEMPTS,
  backoffDelayMs,
  classifyFailure,
  sanitizeErrorText,
  type MetaClient,
  type PublishInput,
} from "./core.ts";
import { rollupStatus } from "./publishing.ts";
import type { JobStore } from "./store.ts";

export interface SchedulerDeps {
  store: JobStore;
  client: MetaClient;
  /** Return the Page access token for a connected_pages id, or null if missing. */
  getPageToken: (connectedPageId: string) => Promise<string | null>;
  workerId: string;
  claimLimit?: number;
  maxAttempts?: number;
  /** Override in tests for deterministic timing. */
  now?: () => number;
}

export interface TickResult {
  claimed: number;
  published: number;
  failed: number;
  retried: number;
  dead: number;
  needsReauth: number;
}

export async function runSchedulerTick(deps: SchedulerDeps): Promise<TickResult> {
  const { store, client, getPageToken, workerId } = deps;
  const claimLimit = deps.claimLimit ?? 10;
  const maxAttempts = deps.maxAttempts ?? MAX_ATTEMPTS;
  const nowMs = deps.now ? deps.now() : Date.now();
  const now = new Date(nowMs).toISOString();

  const result: TickResult = { claimed: 0, published: 0, failed: 0, retried: 0, dead: 0, needsReauth: 0 };
  const jobs = await store.claimDueJobs(claimLimit, workerId, now);
  result.claimed = jobs.length;
  const affectedPosts = new Set<string>();

  for (const job of jobs) {
    const target = await store.getTarget(job.post_target_id);
    if (!target) {
      await store.updateJob(job.id, { status: "dead", last_error: "target row missing" });
      result.dead++;
      continue;
    }
    affectedPosts.add(target.post_id);
    const post = await store.getPost(target.post_id);
    if (!post) {
      await store.updateJob(job.id, { status: "dead", last_error: "post row missing" });
      await store.updateTarget(target.id, { target_status: "failed", last_error_message: "post row missing" });
      result.dead++;
      continue;
    }

    const token = await getPageToken(target.connected_page_id);
    if (!token) {
      await store.updateTarget(target.id, {
        target_status: "needs_reauthorization",
        last_error_code: "190",
        last_error_message: "No stored Page token — reconnect the Page.",
      });
      await store.updateJob(job.id, { status: "needs_reauthorization", last_error: "missing page token" });
      await store.recordAttempt(job.id, "needs_reauthorization", "missing page token");
      result.needsReauth++;
      continue;
    }

    const input: PublishInput = {
      pageId: target.meta_page_id,
      caption: post.caption,
      mediaUrl: undefined, // Phase 6 wires media URLs for image/video/reel
      kind: post.post_type,
      idempotencyKey: job.idempotency_key,
    };

    let published: { remoteId?: string; remoteUrl?: string } | null = null;
    let failure: { code?: string; message: string; retryable: boolean } | null = null;
    try {
      const r = await client.publish(input, token);
      if (r.ok && r.remoteId) {
        published = { remoteId: r.remoteId, remoteUrl: r.remoteUrl };
      } else {
        const cls = classifyFailure(r.errorCode);
        failure = {
          code: r.errorCode,
          message: sanitizeErrorText(r.errorMessage ?? "publish failed"),
          retryable: r.retryable ?? cls.retryable,
        };
        failure.retryable = failure.retryable && cls.outcome !== "needs_reauthorization";
        if (cls.outcome === "needs_reauthorization") failure.code = "needs_reauthorization";
      }
    } catch (e) {
      // Transport-level failure (timeout/network): outcome uncertain → retryable,
      // and reconcile before retrying so we never double-post.
      failure = { code: "timeout", message: sanitizeErrorText(e instanceof Error ? e.message : String(e)), retryable: true };
    }

    if (published) {
      await store.updateTarget(target.id, {
        target_status: "published",
        remote_post_id: published.remoteId ?? null,
        remote_post_url: published.remoteUrl ?? null,
      });
      await store.updateJob(job.id, { status: "published", locked_at: null, locked_by: null });
      await store.recordAttempt(job.id, "success", undefined, published.remoteId);
      result.published++;
      continue;
    }

    const f = failure as { code?: string; message: string; retryable: boolean };
    const exhausted = job.attempt_count >= maxAttempts;

    if (f.code === "needs_reauthorization") {
      await store.updateTarget(target.id, {
        target_status: "needs_reauthorization",
        last_error_code: "190",
        last_error_message: f.message,
      });
      await store.updateJob(job.id, { status: "needs_reauthorization", last_error: f.message });
      await store.recordAttempt(job.id, "needs_reauthorization", f.message);
      result.needsReauth++;
      continue;
    }

    // Reconcile-before-retry: an uncertain outcome might have published.
    if ((f.code === "timeout" || f.code === "network") && client.findExisting) {
      try {
        const existing = await client.findExisting(input, token);
        if (existing) {
          await store.updateTarget(target.id, {
            target_status: "published",
            remote_post_id: existing,
            last_error_message: "Recovered via reconcile — post existed, not re-posted.",
          });
          await store.updateJob(job.id, { status: "published", locked_at: null, locked_by: null });
          await store.recordAttempt(job.id, "skipped_duplicate", "reconciled: already published", existing);
          result.published++;
          continue;
        }
      } catch {
        // Reconcile itself failed — fall through to normal retry handling.
      }
    }

    if (f.retryable && !exhausted) {
      const delayMs = backoffDelayMs(job.attempt_count);
      await store.updateJob(job.id, {
        status: "scheduled",
        next_attempt_at: new Date(nowMs + delayMs).toISOString(),
        last_error: f.message,
        locked_at: null,
        locked_by: null,
      });
      await store.updateTarget(target.id, {
        target_status: "scheduled",
        last_error_code: f.code ?? null,
        last_error_message: f.message,
      });
      await store.recordAttempt(job.id, "rate_limited", f.message);
      result.retried++;
    } else {
      const dead = exhausted && f.retryable;
      await store.updateTarget(target.id, {
        target_status: "failed",
        last_error_code: f.code ?? null,
        last_error_message: f.message,
      });
      await store.updateJob(job.id, { status: dead ? "dead" : "failed", last_error: f.message });
      await store.recordAttempt(job.id, "failed", f.message);
      if (dead) result.dead++;
      else result.failed++;
    }
  }

  // Roll up each affected post's overall status from its targets — truthfully.
  for (const postId of affectedPosts) {
    const targets = await store.listTargetsForPost(postId);
    await store.updatePostStatus(postId, rollupStatus(targets));
  }

  return result;
}
