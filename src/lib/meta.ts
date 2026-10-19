import { isSupabaseConfigured, supabase } from "./supabase";

/**
 * Meta OAuth + token import — Phase 3 frontend wiring.
 * All secrets stay server-side: the browser only calls our Edge Functions,
 * which hold META_APP_SECRET and the Page tokens in Vault.
 */

function functionsBase(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined ?? "").replace(/\/$/, "");
  return `${url}/functions/v1`;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) throw new Error("You are signed out. Sign in again to continue.");
  return fetch(`${functionsBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      ...(init.headers ?? {}),
    },
  });
}

/** Step 1 of OAuth: ask the backend for the Meta dialog URL, then redirect. */
export async function startOAuth(): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error("OAuth is not configured yet (Phase 3 — Supabase + Meta app).");
  const res = await authedFetch("/oauth-start", { method: "POST" });
  const body = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? "Could not start Facebook OAuth.");
  window.location.href = body.url;
}

/** Manual token import. The token is POSTed once over HTTPS, never logged. */
export async function importPageToken(token: string): Promise<{ page_id: string; page_name: string }> {
  if (!isSupabaseConfigured()) throw new Error("Token import is not configured yet (Phase 3).");
  const res = await authedFetch("/token-import", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  const body = (await res.json()) as { page_id?: string; page_name?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Token import failed.");
  return { page_id: body.page_id!, page_name: body.page_name! };
}

/** Generic authenticated Edge Function call. Returns the parsed JSON body. */
export async function callFunction<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await authedFetch(path, { method: "POST", body: JSON.stringify(body) });
  const parsed = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(parsed.error ?? `Request to ${path} failed.`);
  return parsed;
}

/** Re-validate a single Page connection (reads the token server-side). */
export async function validatePage(connectedPageId: string): Promise<{ page_name: string; connection_status: string; valid: boolean }> {
  if (!isSupabaseConfigured()) throw new Error("Not configured yet (Phase 3).");
  const res = await authedFetch("/page-validate", {
    method: "POST",
    body: JSON.stringify({ connected_page_id: connectedPageId }),
  });
  const body = (await res.json()) as { page_name?: string; connection_status?: string; valid?: boolean; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Validation failed.");
  return { page_name: body.page_name ?? "Page", connection_status: body.connection_status ?? "unknown", valid: !!body.valid };
}
/** Disconnect a single Page connection. */
export async function disconnectPage(connectedPageId: string): Promise<{ page_name: string }> {
  if (!isSupabaseConfigured()) throw new Error("Not configured yet (Phase 3).");
  const res = await authedFetch("/page-disconnect", {
    method: "POST",
    body: JSON.stringify({ connected_page_id: connectedPageId }),
  });
  const body = (await res.json()) as { page_name?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Disconnect failed.");
  return { page_name: body.page_name ?? "Page" };
}
