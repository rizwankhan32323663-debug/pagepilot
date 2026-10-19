// Shared helpers for PagePilot Edge Functions (Deno runtime).
// Security rules enforced here:
//  - Tokens/secrets are NEVER logged (sanitizeError strips anything
//    that looks like a credential before it reaches logs or responses).
//  - Service-role client is used for all DB access; RLS ownership is
//    re-verified in code (service_role bypasses RLS).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const GRAPH_VERSION = "v21.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const REQUIRED_SCOPES = ["pages_manage_posts", "pages_read_engagement", "pages_show_list"];

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Server misconfigured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url, key);
}

/** Authenticate the caller from the Authorization: Bearer <supabase-jwt> header. */
export async function requireUser(req: Request): Promise<{ id: string; email?: string }> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("Server misconfigured: SUPABASE_URL / SUPABASE_ANON_KEY missing");
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) throw httpError(401, "Missing Authorization header");
  const client = createClient(url, anon);
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data.user) throw httpError(401, "Invalid or expired session");
  return { id: data.user.id, email: data.user.email ?? undefined };
}

export function httpError(status: number, message: string): Error & { status: number } {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export function redirectResponse(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

/** Handle CORS preflight for browser-invoked functions. */
export function corsHeaders(req: Request): Record<string, string> | null {
  if (req.method === "OPTIONS") {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    };
  }
  return null;
}

/**
 * Remove anything credential-like from an error before logging/returning it.
 * Meta tokens are long alphanumeric strings; app secrets are 32 hex chars.
 */
export function sanitizeError(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err);
  msg = msg.replace(/EAAB[A-Za-z0-9_-]+/g, "[TOKEN]");
  msg = msg.replace(/access_token=[^&\s]+/gi, "access_token=[TOKEN]");
  msg = msg.replace(/\b[0-9a-f]{32}\b/gi, "[SECRET]");
  return msg.slice(0, 500);
}

export interface MetaError {
  message: string;
  code?: number;
  subcode?: number;
}

/** GET a Meta Graph API endpoint. Throws httpError with Meta's message on failure. */
export async function metaGet<T>(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<T> {
  const qs = new URLSearchParams({ access_token: token, ...params });
  const res = await fetch(`${GRAPH_BASE}${path}?${qs.toString()}`);
  const data = (await res.json()) as { error?: MetaError } & T;
  if (!res.ok || data.error) {
    const e = data.error;
    throw httpError(
      res.status >= 500 ? 502 : 400,
      `Meta API error${e?.code ? ` (${e.code}${e.subcode ? `/${e.subcode}` : ""})` : ""}: ${e?.message ?? res.statusText}`,
    );
  }
  return data as T;
}

export function sha256Hex(input: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)).then((buf) =>
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  );
}

export function randomState(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function requiredScopes(): string[] {
  return [...REQUIRED_SCOPES];
}

export function metaEnv(): { appId: string; appSecret: string; redirectUri: string; appUrl: string } {
  const appId = Deno.env.get("META_APP_ID") ?? "";
  const appSecret = Deno.env.get("META_APP_SECRET") ?? "";
  const redirectUri = Deno.env.get("META_REDIRECT_URI") ?? "";
  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  if (!appId || !appSecret || !redirectUri || !appUrl) {
    throw new Error("Server misconfigured: META_APP_ID / META_APP_SECRET / META_REDIRECT_URI / APP_URL missing");
  }
  return { appId, appSecret, redirectUri, appUrl };
}
