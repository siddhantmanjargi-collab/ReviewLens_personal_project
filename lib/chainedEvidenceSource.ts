import type { ProductEvidence, ProductEvidenceSource } from "./types";

export class ChainedEvidenceSource implements ProductEvidenceSource {
  constructor(private readonly sources: ProductEvidenceSource[]) {}

  async retrieve(candidateUrl: string, asin: string): Promise<ProductEvidence> {
    let last: ProductEvidence | null = null;
    for (const src of this.sources) {
      const ev = await src.retrieve(candidateUrl, asin);
      last = ev;
      if (ev.status === "ok") return ev;
    }
    return (
      last ?? {
        status: "unavailable",
        retrievalStatus: "unavailable",
        dataSourceType: "dataset",
        retrievedAt: new Date().toISOString(),
      }
    );
  }
}
