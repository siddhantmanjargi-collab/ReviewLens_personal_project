"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeSupabaseKey, sanitizeSupabaseUrl } from "./config";

let cachedBrowserClient: SupabaseClient | null | undefined;

/**
 * Returns a @supabase/ssr browser client when NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY are configured, or null in local preview mode.
 */
export function createBrowserSupabaseClient(): SupabaseClient | null {
  if (cachedBrowserClient !== undefined) {
    return cachedBrowserClient;
  }

  const url = sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = sanitizeSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !anonKey) {
    cachedBrowserClient = null;
    return null;
  }

  cachedBrowserClient = createBrowserClient(url, anonKey);
  return cachedBrowserClient;
}
