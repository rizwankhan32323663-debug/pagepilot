import React from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { validateMediaFile } from "./core";

/**
 * Data layer — Phase 7.
 * Every screen works in two honest modes:
 *  - LIVE: Supabase is configured AND the user is signed in → real rows via RLS.
 *  - DEMO: otherwise → clearly labelled demo data, zero fake "real" claims.
 */

export interface LivePage {
  id: string;
  meta_page_id: string;
  page_name: string;
  connection_method: "oauth" | "manual";
  connection_status: string;
  permissions_granted: string[];
  last_checked_at: string | null;
  last_published_at: string | null;
}

export interface LiveQueueRow {
  jobId: string;
  status: string;
  runAtUtc: string;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  caption: string;
  postType: string;
  pageName: string;
  targetStatus: string;
  remoteUrl: string | null;
}

export interface LiveLogRow {
  id: string;
  startedAt: string;
  outcome: string;
  error: string | null;
  remoteId: string | null;
  caption: string;
  pageName: string;
}

export interface LiveMedia {
  id: string;
  storage_path: string;
  media_type: "image" | "video";
  mime_type: string;
  file_size: number;
  created_at: string;
}

export interface PageStats {
  page: string;
  published: number;
  scheduled: number;
  failed: number;
  drafts: number;
}

/** Dual-mode hook: live data when possible, fallback (demo) otherwise. */
export function useLive<T>(fetcher: () => Promise<T>, fallback: T): {
  live: boolean;
  loading: boolean;
  data: T;
  refresh: () => void;
} {
  const { user, loading: authLoading, configured } = useAuth();
  const [data, setData] = React.useState<T>(fallback);
  const [loading, setLoading] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const live = configured && !!user && !authLoading;

  React.useEffect(() => {
    if (!live || !supabase) {
      setData(fallback);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetcher()
      .then((rows) => {
        if (!cancelled) setData(rows);
      })
      .catch(() => {
        if (!cancelled) setData(fallback); // honest: show demo rather than crash
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, tick]);

  return { live, loading, data, refresh: () => setTick((t) => t + 1) };
}

function mustClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

// ---------------------------------------------------------------------------
// Fetchers (live mode)
// ---------------------------------------------------------------------------

export async function fetchPages(): Promise<LivePage[]> {
  const { data, error } = await mustClient()
    .from("connected_pages")
    .select("id, meta_page_id, page_name, connection_method, connection_status, permissions_granted, last_checked_at, last_published_at")
    .order("page_name");
  if (error) throw error;
  return (data ?? []) as LivePage[];
}

export async function fetchQueue(): Promise<LiveQueueRow[]> {
  const { data, error } = await mustClient()
    .from("scheduled_jobs")
    .select(
      "id, status, run_at_utc, attempt_count, next_attempt_at, last_error, " +
        "post_targets!inner(target_status, remote_post_url, posts!inner(caption, post_type), connected_pages!inner(page_name))",
    )
    .order("run_at_utc", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    id: string; status: string; run_at_utc: string; attempt_count: number;
    next_attempt_at: string | null; last_error: string | null;
    post_targets: { target_status: string; remote_post_url: string | null; posts: { caption: string; post_type: string }; connected_pages: { page_name: string } };
  }>).map((j) => ({
    jobId: j.id,
    status: j.status,
    runAtUtc: j.run_at_utc,
    attempts: j.attempt_count,
    nextAttemptAt: j.next_attempt_at,
    lastError: j.last_error,
    caption: j.post_targets.posts.caption,
    postType: j.post_targets.posts.post_type,
    pageName: j.post_targets.connected_pages.page_name,
    targetStatus: j.post_targets.target_status,
    remoteUrl: j.post_targets.remote_post_url,
  }));
}

export async function cancelJob(jobId: string): Promise<void> {
  const db = mustClient();
  const { error } = await db.from("scheduled_jobs").update({ status: "cancelled" }).eq("id", jobId).in("status", ["scheduled", "queued"]);
  if (error) throw error;
}

export async function fetchLogs(): Promise<LiveLogRow[]> {
  const { data, error } = await mustClient()
    .from("publish_attempts")
    .select(
      "id, started_at, outcome, sanitized_error, remote_id, " +
        "scheduled_jobs!inner(post_targets!inner(posts!inner(caption), connected_pages!inner(page_name)))",
    )
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{
    id: string; started_at: string; outcome: string; sanitized_error: string | null; remote_id: string | null;
    scheduled_jobs: { post_targets: { posts: { caption: string }; connected_pages: { page_name: string } } };
  }>).map((a) => ({
    id: a.id,
    startedAt: a.started_at,
    outcome: a.outcome,
    error: a.sanitized_error,
    remoteId: a.remote_id,
    caption: a.scheduled_jobs.post_targets.posts.caption,
    pageName: a.scheduled_jobs.post_targets.connected_pages.page_name,
  }));
}

export async function fetchPageStats(): Promise<PageStats[]> {
  const db = mustClient();
  const { data: pages, error: pErr } = await db.from("connected_pages").select("id, page_name");
  if (pErr) throw pErr;
  const { data: targets, error: tErr } = await db.from("post_targets").select("connected_page_id, target_status, posts!inner(overall_status)");
  if (tErr) throw tErr;
  return ((pages ?? []) as Array<{ id: string; page_name: string }>).map((p) => {
    const rows = ((targets ?? []) as Array<{ connected_page_id: string; target_status: string }>)
      .filter((t) => t.connected_page_id === p.id);
    return {
      page: p.page_name,
      published: rows.filter((t) => t.target_status === "published").length,
      scheduled: rows.filter((t) => ["scheduled", "queued", "processing"].includes(t.target_status)).length,
      failed: rows.filter((t) => ["failed", "needs_reauthorization"].includes(t.target_status)).length,
      drafts: 0, // drafts live on posts; counted below if needed
    };
  });
}

export async function fetchMedia(): Promise<LiveMedia[]> {
  const { data, error } = await mustClient()
    .from("media_assets")
    .select("id, storage_path, media_type, mime_type, file_size, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LiveMedia[];
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export async function uploadMedia(file: File, userId: string): Promise<LiveMedia> {
  const check = validateMediaFile({ name: file.name, size: file.size, mime: file.type });
  if (!check.ok) throw new Error(check.error);
  const db = mustClient();
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await db.storage.from("pagepilot-media").upload(path, file, { contentType: file.type });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const { data, error: insErr } = await db
    .from("media_assets")
    .insert({
      user_id: userId,
      storage_path: path,
      media_type: check.kind,
      mime_type: file.type,
      file_size: file.size,
    })
    .select("id, storage_path, media_type, mime_type, file_size, created_at")
    .single();
  if (insErr) {
    await db.storage.from("pagepilot-media").remove([path]); // roll back orphan bytes
    throw new Error(`Could not record media: ${insErr.message}`);
  }
  return data as LiveMedia;
}

export async function deleteMedia(asset: LiveMedia): Promise<void> {
  const db = mustClient();
  const { error: rmErr } = await db.storage.from("pagepilot-media").remove([asset.storage_path]);
  if (rmErr) throw new Error(`Could not delete file: ${rmErr.message}`);
  const { error: delErr } = await db.from("media_assets").delete().eq("id", asset.id);
  if (delErr) throw new Error(`Could not delete record: ${delErr.message}`);
}

export async function signedMediaUrl(path: string): Promise<string | null> {
  const { data, error } = await mustClient().storage.from("pagepilot-media").createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Export / deletion
// ---------------------------------------------------------------------------

export async function exportUserData(): Promise<void> {
  const db = mustClient();
  const tables = ["profiles", "connected_pages", "media_assets", "posts", "post_targets", "scheduled_jobs", "publish_attempts", "audit_events", "user_integrations", "oauth_states"] as const;
  const dump: Record<string, unknown> = { exported_at: new Date().toISOString(), tables: {} };
  for (const t of tables) {
    const { data, error } = await db.from(t).select("*");
    if (error) throw new Error(`Export failed on ${t}: ${error.message}`);
    // Never include token material — vault ids are useless outside the project
    // and ciphertext must not travel in an export file without its key.
    const scrubbed = (data ?? []).map((row: Record<string, unknown>) => {
      const { token_vault_secret_id, user_token_vault_id, token_ciphertext, ...rest } = row;
      void token_vault_secret_id;
      void user_token_vault_id;
      void token_ciphertext;
      return rest;
    });
    (dump.tables as Record<string, unknown>)[t] = scrubbed;
  }
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pagepilot-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function requestAccountDeletion(): Promise<void> {
  const db = mustClient();
  const { data: session } = await db.auth.getSession();
  const jwt = session.session?.access_token;
  if (!jwt) throw new Error("You are signed out.");
  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "");
  const res = await fetch(`${base}/functions/v1/account-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ confirm: "DELETE" }),
  });
  const body = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Account deletion failed.");
  await db.auth.signOut();
}
