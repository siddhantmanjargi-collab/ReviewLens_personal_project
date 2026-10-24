import { z } from "zod";
import type { Repository } from "./repository";
import { parseProductLink } from "./links";
import { CORE_FIELDS } from "./productImport";
import type { NewProduct, ProductRecord } from "./types";

export const linkImportSchema = z.object({
  link: z.string().min(1).max(2000),
  productName: z.string().trim().min(2).max(200),
  brand: z.string().trim().min(1).max(100).nullish(),
  model: z.string().trim().min(1).max(100).nullish(),
  category: z.string().trim().min(1).max(60).nullish(),
});
export type LinkImportInput = z.infer<typeof linkImportSchema>;

export type LinkImportOutcome =
  | { status: "created"; product: ProductRecord }
  | { status: "duplicate"; product: ProductRecord }
  | { status: "rejected"; reason: string; detail: string };

/**
 * Creates a LINK-ONLY product from a link and a name the user typed.
 * Nothing about it is checked: identity_verified = false, url_verified = false, and every field the
 * user did not give stays empty and is listed as unavailable.
 */
export async function importLinkProduct(
  input: LinkImportInput,
  deps: { repo: Repository; now?: () => Date },
): Promise<LinkImportOutcome> {
  const link = parseProductLink(input.link);
  if (!link.ok) return { status: "rejected", reason: link.reason, detail: link.detail };

  const existing = await deps.repo.findProduct(link.source, link.externalId);
  if (existing) return { status: "duplicate", product: existing };

  const values = {
    brand: input.brand ?? null,
    manufacturer: null,
    model: input.model ?? null,
    category: input.category ?? null,
    description: null,
    imageUrl: null,
    price: null,
    mrp: null,
    rating: null,
    reviewCount: null,
    availability: null,
  };
  const record: NewProduct = {
    source: link.source,
    externalId: link.externalId,
    verificationLevel: "link_only",
    productName: input.productName,
    ...values,
    deviceType: null,
    discountPercent: null,
    currency: "INR",
    specs: {},
    unavailableFields: CORE_FIELDS.filter((f) => (values as Record<string, unknown>)[f] === null),
    sourceUrl: link.sourceUrl,
    canonicalUrl: null,
    urlVerified: false,
    urlVerificationStatus: "not_checked",
    identityVerified: false,
    retrievalStatus: "unavailable",
    dataSourceType: "user_supplied",
    lastCheckedAt: null,
  };
  const product = await deps.repo.insertProduct(record);
  return { status: "created", product };
}
