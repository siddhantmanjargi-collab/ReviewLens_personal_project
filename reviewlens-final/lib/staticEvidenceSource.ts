import type { ProductEvidence, ProductEvidenceSource } from "./types";

/**
 * Evidence from an approved dataset or authorized API snapshot that YOU curate server-side
 * (for example a JSON file committed to the repo, or rows from a licensed data provider).
 *
 * Records are keyed by ASIN. This source reports retrievalStatus "cached" and
 * dataSourceType "dataset", so it can confirm product identity but can never mark a
 * URL as "verified" (only a live retrieval can).
 *
 * Never build this from data supplied in a client request - that would let a caller
 * vouch for their own claim.
 */
export class StaticEvidenceSource implements ProductEvidenceSource {
  private readonly records: Map<string, Omit<ProductEvidence, "status" | "retrievalStatus" | "dataSourceType" | "retrievedAt">>;
  private readonly capturedAt: string;

  constructor(
    records: Array<Omit<ProductEvidence, "status" | "retrievalStatus" | "dataSourceType" | "retrievedAt"> & { asin: string }>,
    capturedAt: string,
  ) {
    this.records = new Map(records.map((r) => [r.asin, r]));
    this.capturedAt = capturedAt;
  }

  async retrieve(_candidateUrl: string, asin: string): Promise<ProductEvidence> {
    const rec = this.records.get(asin);
    if (!rec) {
      return {
        status: "unavailable",
        retrievalStatus: "unavailable",
        dataSourceType: "dataset",
        retrievedAt: this.capturedAt,
      };
    }
    return {
      ...rec,
      status: "ok",
      retrievalStatus: "cached",
      dataSourceType: "dataset",
      retrievedAt: this.capturedAt,
    };
  }
}
