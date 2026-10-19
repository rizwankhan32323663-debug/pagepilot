// JobStore — database access behind an interface so the scheduler and
// publishing logic run against Supabase in production AND against an
// in-memory store in unit tests / mock mode. Zero runtime imports.
import type {
  AttemptOutcome,
  JobStatus,
  PostKind,
  PostOverallStatus,
  TargetStatus,
} from "./core.ts";

export interface DbPost {
  id: string;
  user_id: string;
  caption: string;
  media_asset_id: string | null;
  post_type: PostKind;
  overall_status: PostOverallStatus;
  scheduled_at_utc: string | null;
  timezone: string;
}

export interface DbTarget {
  id: string;
  post_id: string;
  connected_page_id: string;
  /** Meta Page ID — denormalized for the worker so it avoids a join. */
  meta_page_id: string;
  target_status: TargetStatus;
  remote_post_id: string | null;
  remote_post_url: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  attempt_count: number;
}

export interface DbJob {
  id: string;
  post_target_id: string;
  run_at_utc: string;
  status: JobStatus;
  attempt_count: number;
  locked_at: string | null;
  locked_by: string | null;
  next_attempt_at: string | null;
  idempotency_key: string;
  last_error: string | null;
}

export interface JobStore {
  createPost(p: Omit<DbPost, "id">): Promise<DbPost>;
  getPost(id: string): Promise<DbPost | null>;
  updatePostStatus(id: string, status: PostOverallStatus): Promise<void>;
  createTarget(t: Omit<DbTarget, "id" | "attempt_count" | "remote_post_id" | "remote_post_url" | "last_error_code" | "last_error_message">): Promise<DbTarget>;
  getTarget(id: string): Promise<DbTarget | null>;
  listTargetsForPost(postId: string): Promise<DbTarget[]>;
  updateTarget(
    id: string,
    patch: Partial<Pick<DbTarget, "target_status" | "remote_post_id" | "remote_post_url" | "last_error_code" | "last_error_message">>,
  ): Promise<void>;
  /** Must throw { code: "DUPLICATE_IDEMPOTENCY_KEY" } on key collision. */
  createJob(j: Omit<DbJob, "id" | "attempt_count" | "locked_at" | "locked_by" | "next_attempt_at" | "last_error">): Promise<DbJob>;
  /** Atomically claim due jobs (production: FOR UPDATE SKIP LOCKED). Increments attempt_count. */
  claimDueJobs(limit: number, workerId: string, nowIso: string): Promise<DbJob[]>;
  updateJob(
    id: string,
    patch: Partial<Pick<DbJob, "status" | "next_attempt_at" | "last_error" | "locked_at" | "locked_by">>,
  ): Promise<void>;
  recordAttempt(jobId: string, outcome: AttemptOutcome, sanitizedError?: string, remoteId?: string): Promise<void>;
  listAttempts(jobId: string): Promise<Array<{ outcome: AttemptOutcome; sanitizedError: string | null; remoteId: string | null }>>;
}

/** In-memory store for tests and mock mode. Single-threaded claim = atomic here. */
export class MemoryJobStore implements JobStore {
  posts = new Map<string, DbPost>();
  targets = new Map<string, DbTarget>();
  jobs = new Map<string, DbJob>();
  attempts = new Map<string, Array<{ outcome: AttemptOutcome; sanitizedError: string | null; remoteId: string | null }>>();
  private keys = new Set<string>();

  private uuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  async createPost(p: Omit<DbPost, "id">): Promise<DbPost> {
    const row = { ...p, id: this.uuid() };
    this.posts.set(row.id, row);
    return row;
  }
  async getPost(id: string): Promise<DbPost | null> {
    return this.posts.get(id) ?? null;
  }
  async updatePostStatus(id: string, status: PostOverallStatus): Promise<void> {
    const p = this.posts.get(id);
    if (p) p.overall_status = status;
  }
  async createTarget(
    t: Omit<DbTarget, "id" | "attempt_count" | "remote_post_id" | "remote_post_url" | "last_error_code" | "last_error_message">,
  ): Promise<DbTarget> {
    const row: DbTarget = {
      ...t,
      id: this.uuid(),
      attempt_count: 0,
      remote_post_id: null,
      remote_post_url: null,
      last_error_code: null,
      last_error_message: null,
    };
    this.targets.set(row.id, row);
    return row;
  }
  async getTarget(id: string): Promise<DbTarget | null> {
    return this.targets.get(id) ?? null;
  }
  async listTargetsForPost(postId: string): Promise<DbTarget[]> {
    return [...this.targets.values()].filter((t) => t.post_id === postId);
  }
  async updateTarget(
    id: string,
    patch: Partial<Pick<DbTarget, "target_status" | "remote_post_id" | "remote_post_url" | "last_error_code" | "last_error_message">>,
  ): Promise<void> {
    const t = this.targets.get(id);
    if (t) Object.assign(t, patch);
  }
  async createJob(
    j: Omit<DbJob, "id" | "attempt_count" | "locked_at" | "locked_by" | "next_attempt_at" | "last_error">,
  ): Promise<DbJob> {
    if (this.keys.has(j.idempotency_key)) {
      const err = new Error(`Duplicate idempotency key: ${j.idempotency_key}`);
      (err as { code?: string }).code = "DUPLICATE_IDEMPOTENCY_KEY";
      throw err;
    }
    this.keys.add(j.idempotency_key);
    const row: DbJob = {
      ...j,
      id: this.uuid(),
      attempt_count: 0,
      locked_at: null,
      locked_by: null,
      next_attempt_at: null,
      last_error: null,
    };
    this.jobs.set(row.id, row);
    return row;
  }
  async claimDueJobs(limit: number, workerId: string, nowIso: string): Promise<DbJob[]> {
    const due = [...this.jobs.values()]
      .filter(
        (j) =>
          (j.status === "scheduled" || j.status === "queued") &&
          j.run_at_utc <= nowIso &&
          (j.next_attempt_at === null || j.next_attempt_at <= nowIso),
      )
      .sort((a, b) => (a.run_at_utc < b.run_at_utc ? -1 : 1))
      .slice(0, limit);
    for (const j of due) {
      j.status = "processing";
      j.locked_at = nowIso;
      j.locked_by = workerId;
      j.attempt_count += 1;
    }
    return due;
  }
  async updateJob(
    id: string,
    patch: Partial<Pick<DbJob, "status" | "next_attempt_at" | "last_error" | "locked_at" | "locked_by">>,
  ): Promise<void> {
    const j = this.jobs.get(id);
    if (j) Object.assign(j, patch);
  }
  async recordAttempt(
    jobId: string,
    outcome: AttemptOutcome,
    sanitizedError?: string,
    remoteId?: string,
  ): Promise<void> {
    const list = this.attempts.get(jobId) ?? [];
    list.push({ outcome, sanitizedError: sanitizedError ?? null, remoteId: remoteId ?? null });
    this.attempts.set(jobId, list);
  }
  async listAttempts(jobId: string) {
    return this.attempts.get(jobId) ?? [];
  }
}
