import type { ProductEvidence, ProductEvidenceSource } from "./types";

/**
 * Tries sources in order. Returns the first successful result. If none succeed, returns the
 * first non-"not_checked" failure (so "blocked" or "unavailable" is reported honestly), else
 * the first result.
 */
export class ChainedEvidenceSource implements ProductEvidenceSource {
  constructor(private readonly sources: ProductEvidenceSource[]) {}

  async retrieve(url: string, asin: string): Promise<ProductEvidence> {
    const results: ProductEvidence[] = [];
    for (const s of this.sources) {
      const r = await s.retrieve(url, asin);
      if (r.status === "ok") return r;
      results.push(r);
    }
    return (
      results.find((r) => r.status !== "not_checked") ??
      results[0] ?? {
        status: "not_checked",
        retrievalStatus: "unavailable",
        dataSourceType: "manual_import",
        retrievedAt: new Date().toISOString(),
      }
    );
  }
}
