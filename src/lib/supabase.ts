import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client — Phase 2.
 * The client is created ONLY when both env vars are present. Otherwise this
 * module exports null and the UI honestly reports "not configured" instead
 * of crashing or pretending to be connected.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = (): boolean => Boolean(url && anonKey);

let client: SupabaseClient | null = null;
if (isSupabaseConfigured()) {
  client = createClient(url!, anonKey!);
}

export const supabase: SupabaseClient | null = client;
