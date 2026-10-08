export interface AppConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  adminApiKey: string;
  enableDirectPageCheck: boolean;
}

/** Reads env lazily and throws a clear error if a required secret is missing. Server-side only. */
export function getConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_API_KEY"].filter((k) => !env[k]);
  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  return {
    supabaseUrl: env.SUPABASE_URL!,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY!,
    adminApiKey: env.ADMIN_API_KEY!,
    enableDirectPageCheck: env.ENABLE_DIRECT_PAGE_CHECK === "true",
  };
}
