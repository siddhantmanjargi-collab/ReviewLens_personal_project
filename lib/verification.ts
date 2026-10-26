import type { ProductClaim, ProductEvidenceSource, VerificationResult } from "./types";
import { parseAmazonInUrl } from "./asin";
import { verifyProductIdentity } from "./identity";

export async function verifyProduct(
  claim: ProductClaim,
  evidenceSource: ProductEvidenceSource,
): Promise<VerificationResult> {
  const checkedAt = new Date().toISOString();
  const parsed = parseAmazonInUrl(claim.url);
  if (!parsed.ok || !parsed.asin || !parsed.canonicalUrl) {
    return {
      asin: null,
      urlStatus: "failed",
      urlVerified: false,
      identityVerified: false,
      canonicalUrl: null,
      retrievalStatus: "unavailable",
      dataSourceType: "user_supplied",
      checkedAt,
      reasons: [parsed.reason ?? "Invalid Amazon India URL."],
      evidence: null,
    };
  }

  const evidence = await evidenceSource.retrieve(parsed.canonicalUrl, parsed.asin);
  if (evidence.status !== "ok") {
    const urlStatus = evidence.status === "blocked" ? "blocked" : evidence.status === "not_checked" ? "not_checked" : "unavailable";
    return {
      asin: parsed.asin,
      urlStatus,
      urlVerified: false,
      identityVerified: false,
      canonicalUrl: parsed.canonicalUrl,
      retrievalStatus: evidence.retrievalStatus,
      dataSourceType: evidence.dataSourceType,
      checkedAt,
      reasons: [`Independent product evidence could not be retrieved (${evidence.status}).`],
      evidence,
    };
  }

  const idCheck = verifyProductIdentity(claim, evidence);
  return {
    asin: parsed.asin,
    urlStatus: "verified",
    urlVerified: idCheck.matches,
    identityVerified: idCheck.matches,
    canonicalUrl: evidence.canonicalUrl ?? parsed.canonicalUrl,
    retrievalStatus: evidence.retrievalStatus,
    dataSourceType: evidence.dataSourceType,
    checkedAt,
    reasons: idCheck.reasons,
    evidence,
  };
}
