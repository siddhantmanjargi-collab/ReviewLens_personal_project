export interface IdentityClaim {
  asin: string;
  productName: string;
  brand?: string | null;
  model?: string | null;
}

export interface IdentityEvidence {
  asin?: string | null;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
}

export interface IdentityDecision {
  verified: boolean;
  titleSimilarity: number;
  reasons: string[];
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "of", "in", "to", "by", "on", "at",
  "new", "latest", "pack", "combo", "free", "best", "buy",
]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/** Overlap coefficient: |A∩B| / min(|A|,|B|). Tolerates one side having a longer title. */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size);
}

export const TITLE_SIMILARITY_THRESHOLD = 0.6;

/** Compact form for model numbers: "SM-S921B/DS" -> "sms921bds". */
function compact(text: string): string {
  return normalize(text).replace(/ /g, "");
}

export function compareIdentity(claim: IdentityClaim, evidence: IdentityEvidence): IdentityDecision {
  const reasons: string[] = [];
  let ok = true;

  // 1. ASIN is a hard requirement: evidence must state one and it must match exactly.
  if (!evidence.asin) {
    ok = false;
    reasons.push("Evidence does not state an ASIN, so identity cannot be confirmed.");
  } else if (evidence.asin !== claim.asin) {
    ok = false;
    reasons.push(`ASIN mismatch: claimed ${claim.asin}, evidence says ${evidence.asin}.`);
  }

  // 2. Title must be present and similar enough.
  let sim = 0;
  if (!evidence.title) {
    ok = false;
    reasons.push("Evidence has no product title to compare.");
  } else {
    sim = titleSimilarity(claim.productName, evidence.title);
    if (sim < TITLE_SIMILARITY_THRESHOLD) {
      ok = false;
      reasons.push(
        `Title mismatch (similarity ${sim.toFixed(2)} < ${TITLE_SIMILARITY_THRESHOLD}).`,
      );
    }
  }

  // 3. Brand: if both sides state one, they must agree (containment allowed).
  if (claim.brand && evidence.brand) {
    const a = compact(claim.brand);
    const b = compact(evidence.brand);
    if (!(a === b || a.includes(b) || b.includes(a))) {
      ok = false;
      reasons.push(`Brand mismatch: claimed "${claim.brand}", evidence "${evidence.brand}".`);
    }
  }

  // 4. Model: if claimed, it must appear in the evidence model or title.
  if (claim.model) {
    const wanted = compact(claim.model);
    const haystack = compact(`${evidence.model ?? ""} ${evidence.title ?? ""}`);
    if (wanted.length > 0 && !haystack.includes(wanted)) {
      ok = false;
      reasons.push(`Claimed model "${claim.model}" not found in evidence.`);
    }
  }

  if (ok) reasons.push("ASIN, title and any stated brand/model agree with the evidence.");
  return { verified: ok, titleSimilarity: sim, reasons };
}
