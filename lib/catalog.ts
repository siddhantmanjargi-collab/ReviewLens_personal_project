import { z } from "zod";
import { isValidAsin } from "./asin";
import { StaticEvidenceSource } from "./staticEvidenceSource";
import catalogJson from "../data/approved-catalog.json";

const recordSchema = z.object({
  asin: z.string().refine(isValidAsin, "invalid ASIN"),
  title: z.string().min(1),
  canonicalUrl: z.string().nullish(),
  officialUrl: z.string().nullish(),
  brand: z.string().nullish(),
  manufacturer: z.string().nullish(),
  model: z.string().nullish(),
  category: z.string().nullish(),
  deviceType: z.string().nullish(),
  description: z.string().nullish(),
  imageUrl: z.string().nullish(),
  price: z.number().nonnegative().nullish(),
  mrp: z.number().nonnegative().nullish(),
  rating: z.number().min(0).max(5).nullish(),
  reviewCount: z.number().int().nonnegative().nullish(),
  availability: z.string().nullish(),
  specs: z.record(z.union([z.string(), z.number(), z.boolean()])).nullish(),
});

export const catalogSchema = z.object({
  capturedAt: z.string().nullable(),
  records: z.array(recordSchema),
});

export function buildCatalogSource(raw: unknown = catalogJson): StaticEvidenceSource {
  const parsed = catalogSchema.parse(raw);
  const seen = new Set<string>();
  for (const r of parsed.records) {
    if (seen.has(r.asin)) throw new Error(`Duplicate ASIN in approved catalog: ${r.asin}`);
    seen.add(r.asin);
  }
  if (parsed.records.length > 0 && !parsed.capturedAt) {
    throw new Error("approved-catalog.json has records but no capturedAt timestamp.");
  }
  return new StaticEvidenceSource(parsed.records, parsed.capturedAt ?? new Date(0).toISOString());
}
