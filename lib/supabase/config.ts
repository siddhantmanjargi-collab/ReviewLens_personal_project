const PLACEHOLDER_URL_FRAGMENTS = [
  "your-project-ref.supabase.co",
  "example.supabase.co",
  "placeholder.supabase.co",
];

const PLACEHOLDER_KEY_FRAGMENTS = [
  "your-supabase-anon-public-key",
  "your-server-side-secret-key",
  "your-anon-key",
  "placeholder",
];

export function sanitizeSupabaseUrl(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (PLACEHOLDER_URL_FRAGMENTS.some((frag) => lower.includes(frag))) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function sanitizeSupabaseKey(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < 20) return null;
  const lower = trimmed.toLowerCase();
  if (PLACEHOLDER_KEY_FRAGMENTS.some((frag) => lower.includes(frag))) {
    return null;
  }
  return trimmed;
}

export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

/**
 * Resolves validated public Supabase URL + Anon Key for @supabase/ssr.
 * Returns null if variables are unset or still contain .env.example placeholders.
 */
export function getSupabasePublicEnv(
  env: Record<string, string | undefined> = process.env,
): SupabasePublicEnv | null {
  const url = sanitizeSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL);
  const anonKey = sanitizeSupabaseKey(
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY,
  );
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
