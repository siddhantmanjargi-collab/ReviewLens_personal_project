import { createClient } from "@supabase/supabase-js";
import { buildCatalogSource } from "./catalog";
import { ChainedEvidenceSource } from "./chainedEvidenceSource";
import { HttpEvidenceSource } from "./httpEvidenceSource";
import { getAnalysisConfig, getConfig, getCronSecret } from "./config";
import { SupabaseRepository } from "./supabaseRepository";
import { HybridCatalogRepository } from "./hybridRepository";
import { MemoryRepository } from "./memoryRepository";
import { createGeminiAnalyzer, type AnalyzeFn, type GeminiFallbackReason } from "./gemini";
import type { Repository } from "./repository";
import type { ProductEvidenceSource } from "./types";

export interface RequestContext {
  repo: Repository;
  catalogMemoryRepo: MemoryRepository;
  evidence: ProductEvidenceSource;
  adminApiKey: string;
  /** Null until a valid GEMINI_API_KEY is configured. */
  analysis: null | { analyze: AnalyzeFn; model: string; dailyLimit: number };
  analysisMissing: string[];
  analysisFallbackReason?: GeminiFallbackReason;
  cronSecret: string | null;
}

const g = globalThis as unknown as { __reviewLensMemoryRepo?: MemoryRepository };

export function getSharedMemoryRepo(): MemoryRepository {
  if (!g.__reviewLensMemoryRepo) {
    g.__reviewLensMemoryRepo = new MemoryRepository();
  }
  return g.__reviewLensMemoryRepo;
}

export function buildContext(): RequestContext {
  const cfg = getConfig();
  const memoryRepo = getSharedMemoryRepo();
  let repo: Repository;
  if (cfg.supabaseUrl && cfg.supabaseServiceRoleKey) {
    try {
      const db = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      repo = new HybridCatalogRepository(new SupabaseRepository(db), memoryRepo);
    } catch {
      repo = memoryRepo;
    }
  } else {
    repo = memoryRepo;
  }

  const evidence = new ChainedEvidenceSource([new HttpEvidenceSource(cfg.enableDirectPageCheck), buildCatalogSource()]);
  const a = getAnalysisConfig();
  return {
    repo,
    catalogMemoryRepo: memoryRepo,
    evidence,
    adminApiKey: cfg.adminApiKey,
    analysis: a.config
      ? {
          analyze: createGeminiAnalyzer({ apiKey: a.config.geminiApiKey, model: a.config.geminiModel }),
          model: a.config.geminiModel,
          dailyLimit: a.config.dailyLimit,
        }
      : null,
    analysisMissing: a.missing,
    analysisFallbackReason: a.fallbackReason,
    cronSecret: getCronSecret(),
  };
}
