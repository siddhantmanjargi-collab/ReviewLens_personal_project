import { z } from "zod";
import type { NewProduct, ProductRecord } from "./types";
import type { Repository } from "./repository";
import { parseProductLink } from "./links";

export const linkImportSchema = z.object({
  url: z.string().trim().min(1),
  productName: z.string().trim().min(2),
  brand: z.string().trim().nullish(),
  category: z.string().trim().nullish(),
  price: z.number().nonnegative().nullish(),
  mrp: z.number().nonnegative().nullish(),
});

export type LinkImportInput = z.infer<typeof linkImportSchema>;

export type LinkImportOutcome =
  | { status: "rejected"; reason: string; detail: string }
  | { status: "duplicate"; product: ProductRecord }
  | { status: "created"; product: ProductRecord };

export async function importLinkProduct(
  input: LinkImportInput,
  deps: { repo: Repository },
): Promise<LinkImportOutcome> {
  const parsed = parseProductLink(input.url);
  if (!parsed.ok) {
    return { status: "rejected", reason: parsed.reason, detail: parsed.detail };
  }

  const existing = await deps.repo.findProduct(parsed.source, parsed.externalId);
  if (existing) {
    return { status: "duplicate", product: existing };
  }

  const price = input.price ?? null;
  const mrp = input.mrp ?? null;
  const discountPercent =
    price !== null && mrp !== null && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : null;

  const newProd: NewProduct = {
    source: parsed.source,
    externalId: parsed.externalId,
    verificationLevel: "link_only",
    productName: input.productName.trim(),
    brand: input.brand?.trim() || null,
    manufacturer: null,
    model: null,
    category: input.category?.trim() || "Electronics",
    deviceType: null,
    description: null,
    imageUrl: null,
    price,
    mrp,
    discountPercent,
    currency: "INR",
    rating: null,
    reviewCount: 0,
    availability: "Check Marketplace",
    specs: {},
    unavailableFields: ["description", "specs", "rating"],
    sourceUrl: parsed.cleanedUrl,
    canonicalUrl: null,
    urlVerified: false,
    urlVerificationStatus: "not_checked",
    identityVerified: false,
    retrievalStatus: "unavailable",
    dataSourceType: "user_supplied",
    lastCheckedAt: null,
  };

  const created = await deps.repo.insertProduct(newProd);
  return { status: "created", product: created };
}
