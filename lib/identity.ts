import type { ProductClaim, ProductEvidence } from "./types";

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

export interface IdentityCheck {
  matches: boolean;
  reasons: string[];
}

export function verifyProductIdentity(claim: ProductClaim, evidence: ProductEvidence): IdentityCheck {
  const reasons: string[] = [];
  if (!evidence.title) {
    return { matches: false, reasons: ["Evidence has no product title to compare against."] };
  }
  const evLower = evidence.title.toLowerCase();
  const claimTokens = tokens(claim.productName);
  const evTokens = new Set(tokens(evidence.title));

  if (claimTokens.length === 0) {
    return { matches: false, reasons: ["Claimed product name has nosearchable tokens."] };
  }

  const matched = claimTokens.filter((t) => evTokens.has(t));
  const overlap = matched.length / claimTokens.length;
  if (overlap < 0.4) {
    reasons.push(`Claimed title "${claim.productName}" does not sufficiently match catalog title "${evidence.title}".`);
  }

  if (claim.brand && evidence.brand) {
    const cb = claim.brand.trim().toLowerCase();
    const eb = evidence.brand.trim().toLowerCase();
    if (cb !== eb && !evLower.includes(cb)) {
      reasons.push(`Claimed brand "${claim.brand}" conflicts with evidence brand "${evidence.brand}".`);
    }
  }

  return { matches: reasons.length === 0, reasons };
}
