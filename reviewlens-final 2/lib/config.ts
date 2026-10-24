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

export interface AnalysisConfig {
  geminiApiKey: string;
  geminiModel: string;
  dailyLimit: number;
}

/** Variables needed only for the Gemini analysis job. Returns what is missing instead of throwing. */
export function getAnalysisConfig(env: Record<string, string | undefined> = process.env): {
  config: AnalysisConfig | null;
  missing: string[];
} {
  const missing = ["GEMINI_API_KEY", "GEMINI_MODEL"].filter((k) => !env[k]);
  if (missing.length > 0) return { config: null, missing };
  const limit = Number.parseInt(env.DAILY_ANALYSIS_LIMIT ?? "", 10);
  return {
    missing: [],
    config: {
      geminiApiKey: env.GEMINI_API_KEY!,
      geminiModel: env.GEMINI_MODEL!,
      dailyLimit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 1000) : 200,
    },
  };
}

/** CRON_SECRET must be at least 16 characters, otherwise the cron endpoint stays disabled. */
export function getCronSecret(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.CRON_SECRET;
  return s && s.length >= 16 ? s : null;
}
