import { createHash } from "node:crypto";
import fs from "node:fs";
import type { GeminiReviewResult } from "./gemini";

const CACHE_FILE_PATH = "/tmp/reviewlens-gemini-cache.json";

interface CacheStats {
  hits: number;
  misses: number;
}

interface GlobalCacheState {
  entries: Map<string, GeminiReviewResult>;
  stats: CacheStats;
  hydrated: boolean;
}

const g = globalThis as unknown as { __reviewLensGeminiCache?: GlobalCacheState };

function getCacheState(): GlobalCacheState {
  if (!g.__reviewLensGeminiCache) {
    g.__reviewLensGeminiCache = {
      entries: new Map<string, GeminiReviewResult>(),
      stats: { hits: 0, misses: 0 },
      hydrated: false,
    };
  }
  const state = g.__reviewLensGeminiCache;
  if (!state.hydrated) {
    state.hydrated = true;
    try {
      if (fs.existsSync(CACHE_FILE_PATH)) {
        const raw = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, "utf8")) as Record<string, GeminiReviewResult>;
        for (const [k, v] of Object.entries(raw)) {
          if (v && typeof v === "object" && typeof v.authenticityRisk === "number") {
            state.entries.set(k, v);
          }
        }
      }
    } catch {
      // Ignore cache file hydration errors in restricted environments
    }
  }
  return state;
}

function persistCache(entries: Map<string, GeminiReviewResult>) {
  try {
    // Cap persisted entries at 1,500 most recent items
    const pairs = [...entries.entries()].slice(-1500);
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(Object.fromEntries(pairs)));
  } catch {
    // Non-fatal if /tmp is read-only
  }
}

export function computeContentCacheKey(params: {
  model: string;
  rating: number;
  title?: string | null;
  text: string;
}): string {
  const normTitle = (params.title ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const normText = params.text.trim().toLowerCase().replace(/\s+/g, " ");
  const payload = `v1|${params.model}|${params.rating}|${normTitle}|${normText}`;
  return createHash("sha256").update(payload).digest("hex");
}

export function getCachedGeminiResult(key: string, targetReviewId: string): GeminiReviewResult | null {
  const state = getCacheState();
  const hit = state.entries.get(key);
  if (!hit) {
    state.stats.misses += 1;
    return null;
  }
  state.stats.hits += 1;
  return { ...hit, reviewId: targetReviewId };
}

export function setCachedGeminiResult(key: string, result: GeminiReviewResult): void {
  const state = getCacheState();
  state.entries.set(key, result);
  persistCache(state.entries);
}

export function getAnalysisCacheSummary() {
  const state = getCacheState();
  const total = state.stats.hits + state.stats.misses;
  return {
    cachedEntries: state.entries.size,
    hits: state.stats.hits,
    misses: state.stats.misses,
    hitRatePercent: total > 0 ? Math.round((state.stats.hits / total) * 1000) / 10 : 0,
  };
}
