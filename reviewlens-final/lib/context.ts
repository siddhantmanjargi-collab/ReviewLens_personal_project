import { createClient } from "@supabase/supabase-js";
import { buildCatalogSource } from "./catalog";
import { ChainedEvidenceSource } from "./chainedEvidenceSource";
import { HttpEvidenceSource } from "./httpEvidenceSource";
import { getConfig } from "./config";
import { SupabaseRepository } from "./supabaseRepository";
import type { Repository } from "./repository";
import type { ProductEvidenceSource } from "./types";

export interface RequestContext {
  repo: Repository;
  evidence: ProductEvidenceSource;
  adminApiKey: string;
}

export function buildContext(): RequestContext {
  const cfg = getConfig();
  const db = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const evidence = new ChainedEvidenceSource([
    new HttpEvidenceSource(cfg.enableDirectPageCheck),
    buildCatalogSource(),
  ]);
  return { repo: new SupabaseRepository(db), evidence, adminApiKey: cfg.adminApiKey };
}
