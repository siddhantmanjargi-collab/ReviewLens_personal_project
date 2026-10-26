import type { ProductEvidence, ProductEvidenceSource } from "./types";

export interface CatalogItem {
  asin: string;
  title: string;
  canonicalUrl?: string | null;
  officialUrl?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  category?: string | null;
  deviceType?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  price?: number | null;
  mrp?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  availability?: string | null;
  specs?: Record<string, string | number | boolean> | null;
}

export class StaticEvidenceSource implements ProductEvidenceSource {
  private readonly byAsin = new Map<string, CatalogItem>();

  constructor(records: CatalogItem[], private readonly capturedAt: string) {
    for (const r of records) {
      this.byAsin.set(r.asin.toUpperCase(), r);
    }
  }

  async retrieve(_candidateUrl: string, asin: string): Promise<ProductEvidence> {
    const rec = this.byAsin.get(asin.toUpperCase());
    if (!rec) {
      return {
        status: "unavailable",
        retrievalStatus: "unavailable",
        dataSourceType: "dataset",
        retrievedAt: this.capturedAt,
      };
    }
    return {
      status: "ok",
      retrievalStatus: "cached",
      dataSourceType: "dataset",
      retrievedAt: this.capturedAt,
      canonicalUrl: rec.canonicalUrl ?? `https://www.amazon.in/dp/${rec.asin}`,
      asin: rec.asin,
      title: rec.title,
      brand: rec.brand ?? null,
      manufacturer: rec.manufacturer ?? null,
      model: rec.model ?? null,
      category: rec.category ?? null,
      deviceType: rec.deviceType ?? null,
      description: rec.description ?? null,
      imageUrl: rec.imageUrl ?? null,
      price: rec.price ?? null,
      mrp: rec.mrp ?? null,
      rating: rec.rating ?? null,
      reviewCount: rec.reviewCount ?? null,
      availability: rec.availability ?? "In Stock",
      specs: rec.specs ?? {},
    };
  }
}
