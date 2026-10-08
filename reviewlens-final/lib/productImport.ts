import type { Repository } from "./repository";
import { verifyProductCandidate } from "./verification";
import type { NewProduct, ProductClaim, ProductEvidenceSource, ProductRecord, VerificationResult } from "./types";

export type ImportOutcome =
  | { status: "created"; product: ProductRecord; verification: VerificationResult }
  | { status: "duplicate"; product: ProductRecord; verification: VerificationResult }
  | { status: "rejected"; verification: VerificationResult };

const CORE_FIELDS = [
  "brand", "manufacturer", "model", "category", "description", "imageUrl",
  "price", "mrp", "rating", "reviewCount", "availability",
] as const;

function discount(price: number | null, mrp: number | null): number | null {
  if (price === null || mrp === null || mrp <= 0 || price > mrp) return null;
  return Math.round(((mrp - price) / mrp) * 10000) / 100;
}

/**
 * Verifies the claim, then stores a product ONLY if identity is verified.
 * Fields are taken from the verified evidence; fields the source did not provide are
 * left null and listed in unavailableFields (never guessed).
 */
export async function importProduct(
  claim: ProductClaim,
  deps: { repo: Repository; evidence: ProductEvidenceSource; now?: () => Date },
): Promise<ImportOutcome> {
  const verification = await verifyProductCandidate(claim, deps.evidence, deps.now);
  if (!verification.identityVerified || !verification.asin || !verification.evidence) {
    return { status: "rejected", verification };
  }

  const existing = await deps.repo.findProductByAsin(verification.asin);
  if (existing) return { status: "duplicate", product: existing, verification };

  const ev = verification.evidence;
  const values = {
    brand: ev.brand ?? claim.brand ?? null,
    manufacturer: ev.manufacturer ?? null,
    model: ev.model ?? claim.model ?? null,
    category: ev.category ?? null,
    description: ev.description ?? null,
    imageUrl: ev.imageUrl ?? null,
    price: ev.price ?? null,
    mrp: ev.mrp ?? null,
    rating: ev.rating ?? null,
    reviewCount: ev.reviewCount ?? null,
    availability: ev.availability ?? null,
  };
  const unavailableFields = CORE_FIELDS.filter((f) => values[f] === null);

  const record: NewProduct = {
    source: "amazon.in",
    asin: verification.asin,
    // Name comes from the verified evidence title, falling back to the (already matched) claim.
    productName: ev.title ?? claim.productName,
    ...values,
    deviceType: ev.deviceType ?? null,
    discountPercent: discount(values.price, values.mrp),
    currency: "INR",
    specs: ev.specs ?? {},
    unavailableFields: [...unavailableFields],
    sourceUrl: `https://www.amazon.in/dp/${verification.asin}`,
    canonicalUrl: verification.canonicalUrl,
    urlVerified: verification.urlVerified,
    urlVerificationStatus: verification.urlStatus,
    identityVerified: true,
    retrievalStatus: verification.retrievalStatus,
    dataSourceType: verification.dataSourceType,
    lastCheckedAt: verification.checkedAt,
  };
  const product = await deps.repo.insertProduct(record);
  return { status: "created", product, verification };
}
