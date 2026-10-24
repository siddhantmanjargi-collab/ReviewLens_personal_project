export const ASIN_REGEX = /^[A-Z0-9]{10}$/;

const ALLOWED_HOSTS = new Set(["amazon.in", "www.amazon.in"]);

export type ParseFailureReason =
  | "invalid_url"
  | "not_http"
  | "wrong_marketplace"
  | "search_or_listing_url"
  | "no_asin";

export type ParsedAmazonUrl =
  | { ok: true; asin: string; candidateUrl: string }
  | { ok: false; reason: ParseFailureReason; detail: string };

export function isValidAsin(value: unknown): value is string {
  return typeof value === "string" && ASIN_REGEX.test(value);
}

/**
 * Extracts the ASIN from an amazon.in product URL.
 *
 * IMPORTANT: this only checks that the URL is *shaped* like an amazon.in product URL.
 * `candidateUrl` is NOT a verified URL. Verification happens in verification.ts.
 */
export function parseAmazonInUrl(raw: string): ParsedAmazonUrl {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "invalid_url", detail: "Not a parseable URL." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "not_http", detail: "Only http(s) URLs are accepted." };
  }
  // Exact hostname match: blocks amazon.com, amazon.in.evil.com, amazon.in@evil.com, etc.
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    return {
      ok: false,
      reason: "wrong_marketplace",
      detail: `Host "${url.hostname}" is not amazon.in.`,
    };
  }
  if (url.pathname.startsWith("/s") && /^\/s(\/|$)/.test(url.pathname)) {
    return {
      ok: false,
      reason: "search_or_listing_url",
      detail: "Search/listing URLs are not product URLs.",
    };
  }
  const match = url.pathname.match(/(?:\/dp\/|\/gp\/product\/|\/product-reviews\/)([A-Z0-9]{10})(?=\/|$)/);
  if (!match || !match[1]) {
    return {
      ok: false,
      reason: "no_asin",
      detail: "No ASIN found in a /dp/, /gp/product/ or /product-reviews/ path.",
    };
  }
  const asin = match[1];
  return { ok: true, asin, candidateUrl: `https://www.amazon.in/dp/${asin}` };
}

/** Same checks, for a canonical URL reported by a source. Returns the ASIN or null. */
export function asinFromAmazonInUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = parseAmazonInUrl(raw);
  return parsed.ok ? parsed.asin : null;
}
