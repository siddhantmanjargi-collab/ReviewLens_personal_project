import type { Marketplace } from "./types";
import { parseAmazonInUrl } from "./asin";

export type ParsedProductLink =
  | { ok: true; source: Marketplace; externalId: string; cleanedUrl: string }
  | { ok: false; reason: string; detail: string };

const FLIPKART_HOSTS = new Set(["flipkart.com", "www.flipkart.com", "m.flipkart.com"]);
const PID_RE = /^[A-Z0-9]{10,24}$/i;

export function parseProductLink(rawUrl: string): ParsedProductLink {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: "invalid_url", detail: "URL is not valid." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, reason: "invalid_protocol", detail: "Only http/https links are accepted." };
  }
  const host = u.hostname.toLowerCase();

  if (host === "amzn.in" || host === "dl.flipkart.com" || host === "fkrt.it") {
    return { ok: false, reason: "short_link_not_allowed", detail: "Shortened links cannot be verified without network calls. Paste the full product URL." };
  }

  if (host.endsWith("amazon.in")) {
    const parsed = parseAmazonInUrl(rawUrl);
    if (!parsed.ok || !parsed.asin || !parsed.canonicalUrl) {
      return { ok: false, reason: "missing_asin", detail: parsed.reason ?? "Could not extract Amazon ASIN." };
    }
    return { ok: true, source: "amazon.in", externalId: parsed.asin, cleanedUrl: parsed.canonicalUrl };
  }

  if (FLIPKART_HOSTS.has(host)) {
    const pid = u.searchParams.get("pid")?.trim() ?? "";
    if (!pid || !PID_RE.test(pid)) {
      return { ok: false, reason: "missing_pid", detail: "Flipkart URLs must include a valid ?pid= query parameter." };
    }
    const clean = new URL(`https://www.flipkart.com${u.pathname}`);
    clean.searchParams.set("pid", pid.toUpperCase());
    return { ok: true, source: "flipkart", externalId: pid.toUpperCase(), cleanedUrl: clean.toString() };
  }

  return { ok: false, reason: "unsupported_marketplace", detail: "Only amazon.in and flipkart.com product links are supported." };
}
