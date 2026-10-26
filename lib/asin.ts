const ASIN_RE = /^[A-Z0-9]{10}$/;

export function isValidAsin(value: string): boolean {
  return ASIN_RE.test(value);
}

export interface ParsedAmazonUrl {
  ok: boolean;
  asin: string | null;
  canonicalUrl: string | null;
  reason?: string;
}

const AMAZON_IN_HOSTS = new Set(["amazon.in", "www.amazon.in", "m.amazon.in", "smile.amazon.in"]);

export function parseAmazonInUrl(rawUrl: string): ParsedAmazonUrl {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return { ok: false, asin: null, canonicalUrl: null, reason: "Invalid URL syntax." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, asin: null, canonicalUrl: null, reason: "URL must use http or https." };
  }
  const host = u.hostname.toLowerCase();
  if (host === "amzn.in" || host === "a.co") {
    return { ok: false, asin: null, canonicalUrl: null, reason: "Short links (amzn.in) are not supported; paste the full amazon.in product URL." };
  }
  if (!AMAZON_IN_HOSTS.has(host)) {
    return { ok: false, asin: null, canonicalUrl: null, reason: "Only amazon.in URLs are supported for Amazon imports." };
  }

  const patterns = [
    /\/dp\/([A-Za-z0-9]{10})(?:[/?]|$)/,
    /\/gp\/product\/([A-Za-z0-9]{10})(?:[/?]|$)/,
    /\/gp\/aw\/d\/([A-Za-z0-9]{10})(?:[/?]|$)/,
    /\/product\/([A-Za-z0-9]{10})(?:[/?]|$)/,
  ];
  for (const re of patterns) {
    const m = u.pathname.match(re);
    if (m?.[1]) {
      const asin = m[1].toUpperCase();
      if (isValidAsin(asin)) {
        return { ok: true, asin, canonicalUrl: `https://www.amazon.in/dp/${asin}` };
      }
    }
  }
  return { ok: false, asin: null, canonicalUrl: null, reason: "Could not find a valid 10-character ASIN in the URL path." };
}

export function extractAsin(rawUrl: string): string | null {
  return parseAmazonInUrl(rawUrl).asin;
}

export function canonicalAmazonUrl(asin: string): string {
  return `https://www.amazon.in/dp/${asin.toUpperCase()}`;
}
