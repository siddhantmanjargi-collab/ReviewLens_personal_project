import { parseAmazonInUrl } from "./asin";
import type { Marketplace } from "./types";

export const FLIPKART_PID_REGEX = /^[A-Z0-9]{16}$/;
const FLIPKART_HOSTS = new Set(["flipkart.com", "www.flipkart.com"]);

export type LinkFailure =
  | "invalid_url"
  | "unsupported_site"
  | "short_link"
  | "not_a_product_page"
  | "no_product_id"
  | "search_or_listing_url"
  | "no_asin"
  | "not_http"
  | "wrong_marketplace";

export type ParsedLink =
  | { ok: true; source: Marketplace; externalId: string; sourceUrl: string }
  | { ok: false; reason: LinkFailure; detail: string };

/**
 * Reads the marketplace and product id out of the TEXT of a link. It never opens the link,
 * so a parsed link is only "this looks like product X on site Y", not proof that the page exists.
 */
export function parseProductLink(raw: string): ParsedLink {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "invalid_url", detail: "That is not a valid link." };
  }
  const host = url.hostname.toLowerCase();

  if (host === "dl.flipkart.com" || host === "fkrt.it" || host === "amzn.in" || host === "amzn.to" || host === "a.co") {
    return {
      ok: false,
      reason: "short_link",
      detail: "Short links can't be read. Open the product page and copy the full address from the browser.",
    };
  }

  if (host.includes("amazon.")) {
    const r = parseAmazonInUrl(raw);
    if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail };
    return { ok: true, source: "amazon.in", externalId: r.asin, sourceUrl: r.candidateUrl };
  }

  if (FLIPKART_HOSTS.has(host)) {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { ok: false, reason: "not_http", detail: "Only http(s) links are accepted." };
    }
    if (/^\/(search|[a-z0-9-]+-store)(\/|$)/i.test(url.pathname) || url.pathname === "/") {
      return { ok: false, reason: "search_or_listing_url", detail: "That is a search or listing page, not a product page." };
    }
    if (!/\/p\/[^/]+/.test(url.pathname)) {
      return { ok: false, reason: "not_a_product_page", detail: "Flipkart product links contain /p/ in the address." };
    }
    const pid = url.searchParams.get("pid") ?? "";
    if (!FLIPKART_PID_REGEX.test(pid)) {
      return {
        ok: false,
        reason: "no_product_id",
        detail: "The link has no valid pid. Copy the full address from the product page (it contains ?pid=...).",
      };
    }
    const safePath = url.pathname.replace(/[^A-Za-z0-9\-_/.%]/g, "").slice(0, 300);
    return { ok: true, source: "flipkart", externalId: pid, sourceUrl: `https://www.flipkart.com${safePath}?pid=${pid}` };
  }

  return { ok: false, reason: "unsupported_site", detail: "Only amazon.in and flipkart.com links are supported." };
}
