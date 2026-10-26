import type { ProductEvidence, ProductEvidenceSource } from "./types";

export class HttpEvidenceSource implements ProductEvidenceSource {
  constructor(private readonly enabled: boolean) {}

  async retrieve(candidateUrl: string, asin: string): Promise<ProductEvidence> {
    const now = new Date().toISOString();
    if (!this.enabled) {
      return {
        status: "not_checked",
        retrievalStatus: "unavailable",
        dataSourceType: "live_retrieval",
        retrievedAt: now,
      };
    }

    try {
      const res = await fetch(candidateUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 403 || res.status === 429 || res.status === 503) {
        return { status: "blocked", retrievalStatus: "failed", dataSourceType: "live_retrieval", retrievedAt: now };
      }
      if (!res.ok) {
        return { status: "unavailable", retrievalStatus: "failed", dataSourceType: "live_retrieval", retrievedAt: now };
      }
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const rawTitle = titleMatch?.[1]?.replace(/\s*:\s*Amazon\.in.*$/i, "").trim() ?? null;
      return {
        status: rawTitle ? "ok" : "unavailable",
        retrievalStatus: "live",
        dataSourceType: "live_retrieval",
        retrievedAt: now,
        finalUrl: res.url,
        canonicalUrl: `https://www.amazon.in/dp/${asin}`,
        asin,
        title: rawTitle,
      };
    } catch {
      return { status: "error", retrievalStatus: "failed", dataSourceType: "live_retrieval", retrievedAt: now };
    }
  }
}
