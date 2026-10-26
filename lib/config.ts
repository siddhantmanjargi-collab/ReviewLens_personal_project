import {
  getGeminiKeyFallbackReason,
  sanitizeGeminiApiKey,
  type GeminiFallbackReason,
} from "./gemini";

export interface AppConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  adminApiKey: string;
  enableDirectPageCheck: boolean;
}

/** Reads env lazily with default fallbacks for missing secrets in dev environment. Server-side only. */
export function getConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return {
    supabaseUrl: env.SUPABASE_URL ?? "",
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    adminApiKey: env.ADMIN_API_KEY || "dev-admin-key",
    enableDirectPageCheck: env.ENABLE_DIRECT_PAGE_CHECK === "true",
  };
}

export interface AnalysisConfig {
  geminiApiKey: string;
  geminiModel: string;
  dailyLimit: number;
}

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/** Variables needed for the Gemini analysis job. Returns missing list and reason if key is missing or invalid. */
export function getAnalysisConfig(env: Record<string, string | undefined> = process.env): {
  config: AnalysisConfig | null;
  missing: string[];
  fallbackReason?: GeminiFallbackReason;
} {
  const rawKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const keyFallbackReason = getGeminiKeyFallbackReason(rawKey);
  if (keyFallbackReason !== null) {
    return {
      config: null,
      missing: ["GEMINI_API_KEY"],
      fallbackReason: keyFallbackReason,
    };
  }
  const cleanKey = sanitizeGeminiApiKey(rawKey)!;
  const limit = Number.parseInt(env.DAILY_ANALYSIS_LIMIT ?? "", 10);
  return {
    missing: [],
    config: {
      geminiApiKey: cleanKey,
      geminiModel: model,
      dailyLimit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 1000) : 200,
    },
  };
}

/** CRON_SECRET must be at least 16 characters, otherwise the cron endpoint stays disabled. */
export function getCronSecret(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.CRON_SECRET || "dev-cron-secret-key-16chars";
  return s && s.length >= 16 ? s : null;
}

