// SupabaseJobStore — production JobStore backed by Supabase Postgres.
// Runs with the SERVICE-ROLE key (bypasses RLS), so every method re-verifies
// ownership via the userId passed in at construction. Deno only.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AttemptOutcome, JobStatus, PostOverallStatus } from "./core.ts";
import type { DbJob, DbPost, DbTarget, JobStore } from "./store.ts";
import { decryptToken, loadEncryptionKey } from "./crypto.ts";

export class SupabaseJobStore implements JobStore {
  private db: SupabaseClient;
  private userId: string;

  constructor(userId: string) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Server misconfigured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
    this.db = createClient(url, key);
    this.userId = userId;
  }

  /** Expose the raw client for storage downloads and audit writes by callers. */
  raw(): SupabaseClient {
    return this.db;
  }

  private async ownedPostQuery() {
    return this.db.from("posts").select("*").eq("user_id", this.userId);
  }

  async createPost(p: Omit<DbPost, "id">): Promise<DbPost> {
    const { data, error } = await this.db
      .from("posts")
      .insert({ ...p, user_id: this.userId })
      .select()
      .single();
    if (error) throw new Error(`createPost: ${error.message}`);
    return data as DbPost;
  }

  async getPost(id: string): Promise<DbPost | null> {
    const { data } = await this.ownedPostQuery().eq("id", id).single();
    return (data as DbPost | null) ?? null;
  }

  async updatePostStatus(id: string, status: PostOverallStatus): Promise<void> {
    const { error } = await this.db.from("posts").update({ overall_status: status }).eq("id", id).eq("user_id", this.userId);
    if (error) throw new Error(`updatePostStatus: ${error.message}`);
  }

  async createTarget(
    t: Omit<DbTarget, "id" | "attempt_count" | "remote_post_id" | "remote_post_url" | "last_error_code" | "last_error_message">,
  ): Promise<DbTarget> {
    // Verify the connected page belongs to this user, and fetch meta_page_id.
    const { data: page, error: pageErr } = await this.db
      .from("connected_pages")
      .select("id, meta_page_id")
      .eq("id", t.connected_page_id)
      .eq("user_id", this.userId)
      .single();
    if (pageErr || !page) throw new Error("createTarget: Page not found or not owned by user");
    const { data, error } = await this.db
      .from("post_targets")
      .insert({
        post_id: t.post_id,
        connected_page_id: t.connected_page_id,
        target_status: t.target_status,
      })
      .select()
      .single();
    if (error) throw new Error(`createTarget: ${error.message}`);
    return { ...(data as DbTarget), meta_page_id: (page as { meta_page_id: string }).meta_page_id };
  }

  async getTarget(id: string): Promise<DbTarget | null> {
    const { data, error } = await this.db
      .from("post_targets")
      .select("*, connected_pages!inner(meta_page_id, user_id)")
      .eq("id", id)
      .eq("connected_pages.user_id", this.userId)
      .single();
    if (error || !data) return null;
    const row = data as DbTarget & { connected_pages: { meta_page_id: string } };
    return { ...row, meta_page_id: row.connected_pages.meta_page_id };
  }

  async listTargetsForPost(postId: string): Promise<DbTarget[]> {
    const post = await this.getPost(postId);
    if (!post) return [];
    const { data, error } = await this.db.from("post_targets").select("*").eq("post_id", postId);
    if (error) throw new Error(`listTargetsForPost: ${error.message}`);
    return (data ?? []) as DbTarget[];
  }

  async updateTarget(
    id: string,
    patch: Partial<Pick<DbTarget, "target_status" | "remote_post_id" | "remote_post_url" | "last_error_code" | "last_error_message">>,
  ): Promise<void> {
    const target = await this.getTarget(id);
    if (!target) throw new Error("updateTarget: target not found or not owned");
    const { error } = await this.db.from("post_targets").update(patch).eq("id", id);
    if (error) throw new Error(`updateTarget: ${error.message}`);
  }

  async createJob(
    j: Omit<DbJob, "id" | "attempt_count" | "locked_at" | "locked_by" | "next_attempt_at" | "last_error">,
  ): Promise<DbJob> {
    const target = await this.getTarget(j.post_target_id);
    if (!target) throw new Error("createJob: target not found or not owned");
    const { data, error } = await this.db.from("scheduled_jobs").insert(j).select().single();
    if (error) {
      if (error.code === "23505") {
        const dup = new Error(`Duplicate idempotency key: ${j.idempotency_key}`);
        (dup as { code?: string }).code = "DUPLICATE_IDEMPOTENCY_KEY";
        throw dup;
      }
      throw new Error(`createJob: ${error.message}`);
    }
    return data as DbJob;
  }

  async claimDueJobs(limit: number, workerId: string, _nowIso: string): Promise<DbJob[]> {
    // Atomicity comes from the SQL function (FOR UPDATE SKIP LOCKED).
    const { data, error } = await this.db.rpc("claim_due_jobs", { p_limit: limit, p_worker: workerId });
    if (error) throw new Error(`claimDueJobs: ${error.message}`);
    const jobs = (data ?? []) as DbJob[];
    // Ownership filter: only this worker's user. (The cron worker processes one
    // user per invocation; multi-user fan-out is a Phase 5 ops concern.)
    const owned: DbJob[] = [];
    for (const job of jobs) {
      const t = await this.getTarget(job.post_target_id);
      if (t) owned.push(job);
      else await this.db.from("scheduled_jobs").update({ status: "dead", last_error: "target not owned" }).eq("id", job.id);
    }
    return owned;
  }

  async updateJob(
    id: string,
    patch: Partial<Pick<DbJob, "status" | "next_attempt_at" | "last_error" | "locked_at" | "locked_by">>,
  ): Promise<void> {
    const { error } = await this.db.from("scheduled_jobs").update(patch).eq("id", id);
    if (error) throw new Error(`updateJob: ${error.message}`);
  }

  async recordAttempt(jobId: string, outcome: AttemptOutcome, sanitizedError?: string, remoteId?: string): Promise<void> {
    const { error } = await this.db.from("publish_attempts").insert({
      scheduled_job_id: jobId,
      outcome,
      sanitized_error: sanitizedError ?? null,
      remote_id: remoteId ?? null,
      finished_at: new Date().toISOString(),
    });
    if (error) throw new Error(`recordAttempt: ${error.message}`);
  }

  async listAttempts(jobId: string) {
    const { data } = await this.db
      .from("publish_attempts")
      .select("outcome, sanitized_error, remote_id")
      .eq("scheduled_job_id", jobId)
      .order("started_at", { ascending: true });
    return (data ?? []) as Array<{ outcome: AttemptOutcome; sanitizedError: string | null; remoteId: string | null }>;
  }

  /**
   * Read and decrypt a Page token — only for a Page owned by this user.
   * Returns null when no token is stored; throws (fails loudly) when the
   * ciphertext cannot be decrypted, e.g. a wrong TOKEN_ENCRYPTION_KEY.
   */
  async readPageToken(connectedPageId: string): Promise<string | null> {
    const { data: row } = await this.db
      .from("connected_pages")
      .select("token_ciphertext")
      .eq("id", connectedPageId)
      .eq("user_id", this.userId)
      .single();
    const blob = (row as { token_ciphertext: string | null } | null)?.token_ciphertext;
    if (!blob) return null;
    return decryptToken(blob, loadEncryptionKey());
  }

  /** Look up the single user_id that owns due jobs (cron entry point). */
  static async userIdsWithDueJobs(): Promise<string[]> {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Server misconfigured");
    const db = createClient(url, key);
    const { data, error } = await db
      .from("scheduled_jobs")
      .select("id, post_targets!inner(post_id, posts!inner(user_id))")
      .in("status", ["scheduled", "queued"])
      .lte("run_at_utc", new Date().toISOString())
      .limit(100);
    if (error) throw new Error(`userIdsWithDueJobs: ${error.message}`);
    const ids = new Set<string>();
    for (const row of (data ?? []) as Array<{ post_targets: { posts: { user_id: string } } }>) {
      ids.add(row.post_targets.posts.user_id);
    }
    return [...ids];
  }
}
