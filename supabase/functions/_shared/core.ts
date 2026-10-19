// PagePilot portable core — types, Meta client interface, error classification,
// retry policy, and timezone helpers.
// ZERO runtime imports: safe to import from Deno Edge Functions, Vite, and vitest.
// Uses only erasable TypeScript (no enums) so `tsc -b` stays green.

export type PostKind = "text" | "image" | "video" | "reel";

export type JobStatus =
  | "scheduled"
  | "queued"
  | "processing"
  | "published"
  | "partially_failed"
  | "failed"
  | "cancelled"
  | "needs_reauthorization"
  | "dead";

export type TargetStatus =
  | "scheduled"
  | "queued"
  | "processing"
  | "published"
  | "partially_failed"
  | "failed"
  | "cancelled"
  | "needs_reauthorization";

export type PostOverallStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "processing"
  | "published"
  | "partially_failed"
  | "failed"
  | "cancelled";

export type AttemptOutcome =
  | "success"
  | "failed"
  | "rate_limited"
  | "needs_reauthorization"
  | "skipped_duplicate";

export interface PublishInput {
  /** Meta Page ID (the numeric page id). */
  pageId: string;
  caption: string;
  /** Publicly reachable URL for image/video/reel. Undefined for text posts. */
  mediaUrl?: string;
  kind: PostKind;
  /** Stable key: `pp:<post_uuid>:<meta_page_id>`. Never publish twice with it. */
  idempotencyKey: string;
}

export interface PublishResult {
  ok: boolean;
  remoteId?: string;
  remoteUrl?: string;
  /** Meta numeric error code as string ("190", "4", ...) or adapter code. */
  errorCode?: string;
  /** Sanitized human-readable message — never contains tokens. */
  errorMessage?: string;
  retryable?: boolean;
}

export interface MetaClient {
  publish(input: PublishInput, pageToken: string): Promise<PublishResult>;
  /**
   * Optional reconciliation: after an uncertain outcome (e.g. timeout), check
   * whether the post actually landed, to avoid duplicates on retry.
   * Returns the remote post id if found, else null.
   */
  findExisting?(input: PublishInput, pageToken: string): Promise<string | null>;
}

export interface TokenValidation {
  valid: boolean;
  pageId?: string;
  pageName?: string;
  scopes: string[];
  expiresAt?: string;
  error?: string;
}

/** Classify a Meta/API failure into a scheduler decision. */
export function classifyFailure(errorCode?: string): { outcome: AttemptOutcome; retryable: boolean } {
  switch (errorCode) {
    case "190": // Invalid OAuth access token / session expired
    case "102": // Session invalid / permission revoked
    case "200": // Permissions error
    case "10": // Permission denied
      return { outcome: "needs_reauthorization", retryable: false };
    case "4": // App request limit reached
    case "17": // User request limit reached
    case "32": // Page request limit reached
    case "613": // Calls to this API have exceeded the rate limit
    case "500":
    case "502":
    case "503":
    case "timeout":
    case "network":
      return { outcome: "rate_limited", retryable: true };
    default:
      // Validation errors (100, 368, ...) and unknown codes: do not blindly retry.
      return { outcome: "failed", retryable: false };
  }
}

export const MAX_ATTEMPTS = 5;

/** Exponential backoff: 2, 4, 8, ... minutes, capped at 1 hour. */
export function backoffDelayMs(attempt: number): number {
  const minutes = Math.pow(2, Math.min(Math.max(attempt, 1), 6));
  return Math.min(minutes * 60_000, 3_600_000);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Convert a wall-clock datetime in a named timezone to a UTC ISO string.
 * `localDateTime` like "2026-10-19T18:30". Schedules are ALWAYS stored in UTC.
 */
export function zonedTimeToUtc(localDateTime: string, timeZone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localDateTime);
  if (!m) throw new Error(`Invalid datetime: ${localDateTime}`);
  const [, Y, Mo, D, h, mi, s] = m;
  const asUtc = Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +(s ?? "0"));
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(asUtc))) parts[p.type] = p.value;
  const wallAsUtc = Date.UTC(
    +parts["year"],
    +parts["month"] - 1,
    +parts["day"],
    (+parts["hour"] || 0) % 24,
    +parts["minute"],
    +parts["second"],
  );
  return new Date(asUtc - (wallAsUtc - asUtc)).toISOString();
}

/** Format a UTC ISO string for display in the user's timezone. */
export function formatInTimeZone(utcIso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(utcIso));
}

/** Strip anything credential-like from an error message. Shared with Edge Functions. */
export function sanitizeErrorText(msg: string): string {
  return msg
    .replace(/EAAB[A-Za-z0-9_-]+/g, "[TOKEN]")
    .replace(/access_token=[^&\s]+/gi, "access_token=[TOKEN]")
    .replace(/\b[0-9a-f]{32}\b/gi, "[SECRET]")
    .slice(0, 500);
}

export interface OAuthStateRow {
  expires_at: string;
  used_at: string | null;
}

/** Pure OAuth state check — unit-testable; used by oauth-callback. */
export function isOAuthStateUsable(
  row: OAuthStateRow | null,
  nowMs: number,
): { ok: boolean; reason?: string } {
  if (!row) return { ok: false, reason: "Unknown OAuth state" };
  if (row.used_at) return { ok: false, reason: "OAuth state already used" };
  if (new Date(row.expires_at).getTime() < nowMs) return { ok: false, reason: "OAuth state expired" };
  return { ok: true };
}

export const REQUIRED_META_SCOPES = ["pages_manage_posts", "pages_read_engagement", "pages_show_list"];

/** Returns the required scopes missing from the granted set. */
export function missingScopes(granted: string[] | undefined, required: string[] = REQUIRED_META_SCOPES): string[] {
  const set = new Set(granted ?? []);
  return required.filter((s) => !set.has(s));
}

export interface MediaFileLike {
  name: string;
  size: number; // bytes
  mime: string;
}

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024; // 1 GB (direct-upload path; see Phase 6)
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

/** Validate an upload before it touches storage or Meta. Pure — unit-testable. */
export function validateMediaFile(file: MediaFileLike): { ok: boolean; kind?: "image" | "video"; error?: string } {
  if (IMAGE_MIMES.has(file.mime)) {
    if (file.size > IMAGE_MAX_BYTES) return { ok: false, error: `Image too large (${Math.round(file.size / 1048576)} MB > 10 MB).` };
    return { ok: true, kind: "image" };
  }
  if (VIDEO_MIMES.has(file.mime)) {
    if (file.size > VIDEO_MAX_BYTES) return { ok: false, error: `Video too large (${Math.round(file.size / 1073741824)} GB > 1 GB).` };
    return { ok: true, kind: "video" };
  }
  return { ok: false, error: `Unsupported file type: ${file.mime || file.name}.` };
}
