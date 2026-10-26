import type { NewProduct, ProductClaim, ProductEvidenceSource, ProductRecord, VerificationResult } from "./types";
import type { Repository } from "./repository";
import { verifyProduct } from "./verification";

export type ImportProductOutcome =
  | { status: "rejected"; verification: VerificationResult }
  | { status: "duplicate"; product: ProductRecord; verification: VerificationResult }
  | { status: "created"; product: ProductRecord; verification: VerificationResult };

export async function importProduct(
  claim: ProductClaim,
  deps: { repo: Repository; evidence: ProductEvidenceSource },
): Promise<ImportProductOutcome> {
  const verification = await verifyProduct(claim, deps.evidence);
  if (!verification.identityVerified || !verification.asin || !verification.evidence) {
    return { status: "rejected", verification };
  }

  const existing = await deps.repo.findProduct("amazon.in", verification.asin);
  if (existing) {
    return { status: "duplicate", product: existing, verification };
  }

  const ev = verification.evidence;
  const price = ev.price ?? null;
  const mrp = ev.mrp ?? null;
  const discountPercent =
    price !== null && mrp !== null && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : null;

  const newProd: NewProduct = {
    source: "amazon.in",
    externalId: verification.asin,
    verificationLevel: "verified",
    productName: ev.title ?? claim.productName,
    brand: ev.brand ?? claim.brand ?? null,
    manufacturer: ev.manufacturer ?? null,
    model: ev.model ?? claim.model ?? null,
    category: ev.category ?? null,
    deviceType: ev.deviceType ?? null,
    description: ev.description ?? null,
    imageUrl: ev.imageUrl ?? null,
    price,
    mrp,
    discountPercent,
    currency: "INR",
    rating: ev.rating ?? null,
    reviewCount: ev.reviewCount ?? null,
    availability: ev.availability ?? "In Stock",
    specs: ev.specs ?? {},
    unavailableFields: [],
    sourceUrl: claim.url,
    canonicalUrl: verification.canonicalUrl,
    urlVerified: verification.urlVerified,
    urlVerificationStatus: verification.urlStatus,
    identityVerified: verification.identityVerified,
    retrievalStatus: verification.retrievalStatus,
    dataSourceType: verification.dataSourceType,
    lastCheckedAt: verification.checkedAt,
  };

  const created = await deps.repo.insertProduct(newProd);
  return { status: "created", product: created, verification };
}
