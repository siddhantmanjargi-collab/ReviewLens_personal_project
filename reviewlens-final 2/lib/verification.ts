import { asinFromAmazonInUrl, parseAmazonInUrl } from "./asin";
import { compareIdentity } from "./identity";
import type {
  ProductClaim,
  ProductEvidence,
  ProductEvidenceSource,
  UrlVerificationStatus,
  VerificationResult,
} from "./types";

function fail(
  status: UrlVerificationStatus,
  reasons: string[],
  asin: string | null,
  evidence: ProductEvidence | null,
  now: () => Date,
): VerificationResult {
  return {
    asin,
    urlStatus: status,
    urlVerified: false,
    identityVerified: false,
    canonicalUrl: null,
    retrievalStatus: evidence?.retrievalStatus ?? "unavailable",
    dataSourceType: evidence?.dataSourceType ?? "manual_import",
    checkedAt: now().toISOString(),
    reasons,
    evidence,
  };
}

/**
 * Candidate URL -> evidence retrieval -> identity comparison -> canonical URL -> verdict.
 *
 * Rules:
 *  - identityVerified requires ASIN + title (+ brand/model if stated) to agree with evidence.
 *  - urlVerified is true ONLY when the evidence came from a live retrieval AND the canonical
 *    URL resolves to the same ASIN. Dataset/cached evidence can confirm identity, but it can
 *    never mark a URL as verified (urlStatus stays "not_checked").
 */
export async function verifyProductCandidate(
  claim: ProductClaim,
  source: ProductEvidenceSource,
  now: () => Date = () => new Date(),
): Promise<VerificationResult> {
  const parsed = parseAmazonInUrl(claim.url);
  if (!parsed.ok) {
    return fail("failed", [`${parsed.reason}: ${parsed.detail}`], null, null, now);
  }
  const { asin, candidateUrl } = parsed;

  let evidence: ProductEvidence;
  try {
    evidence = await source.retrieve(candidateUrl, asin);
  } catch (err) {
    return fail(
      "unavailable",
      [`Evidence source threw: ${err instanceof Error ? err.message : String(err)}`],
      asin,
      null,
      now,
    );
  }

  if (evidence.status === "blocked") {
    return fail("blocked", ["Source blocked retrieval (bot protection or access control). Not bypassed."], asin, evidence, now);
  }
  if (evidence.status === "unavailable") {
    return fail("unavailable", ["Product page or record is unavailable."], asin, evidence, now);
  }
  if (evidence.status === "not_checked") {
    return fail("not_checked", ["No evidence source was able to check this product."], asin, evidence, now);
  }
  if (evidence.status === "error") {
    return fail("failed", ["Evidence retrieval failed."], asin, evidence, now);
  }

  // Redirect to a different product is a hard failure.
  const finalAsin = evidence.finalUrl ? asinFromAmazonInUrl(evidence.finalUrl) : null;
  if (evidence.finalUrl && finalAsin !== asin) {
    return fail(
      "redirected",
      [`Candidate redirected to ${evidence.finalUrl} (ASIN ${finalAsin ?? "unknown"}), not ${asin}.`],
      asin,
      evidence,
      now,
    );
  }

  // Canonical URL reported by the source must be amazon.in and carry the same ASIN.
  let canonical: string | null = null;
  if (evidence.canonicalUrl) {
    const canonicalAsin = asinFromAmazonInUrl(evidence.canonicalUrl);
    if (canonicalAsin !== asin) {
      return fail(
        "failed",
        [`Canonical URL "${evidence.canonicalUrl}" does not resolve to ASIN ${asin} on amazon.in.`],
        asin,
        evidence,
        now,
      );
    }
    canonical = `https://www.amazon.in/dp/${asin}`;
  }

  const identity = compareIdentity(
    { asin, productName: claim.productName, brand: claim.brand, model: claim.model },
    { asin: evidence.asin, title: evidence.title, brand: evidence.brand, model: evidence.model },
  );
  if (!identity.verified) {
    return fail("failed", identity.reasons, asin, evidence, now);
  }

  const live = evidence.retrievalStatus === "live" && evidence.dataSourceType === "live_retrieval";
  const urlVerified = live && canonical !== null;
  const reasons = [...identity.reasons];
  if (!urlVerified) {
    reasons.push(
      live
        ? "Live evidence gave no canonical URL, so the URL is not marked verified."
        : "Evidence is not a live retrieval, so identity is confirmed but the URL is not marked verified.",
    );
  }

  return {
    asin,
    urlStatus: urlVerified ? "verified" : "not_checked",
    urlVerified,
    identityVerified: true,
    canonicalUrl: urlVerified ? canonical : null,
    retrievalStatus: evidence.retrievalStatus,
    dataSourceType: evidence.dataSourceType,
    checkedAt: now().toISOString(),
    reasons,
    evidence,
  };
}
