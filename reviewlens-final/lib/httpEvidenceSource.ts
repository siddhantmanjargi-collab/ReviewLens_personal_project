import type { ProductEvidence, ProductEvidenceSource } from "./types";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const BLOCK_MARKERS = [
  "api-services-support@amazon.com",
  "Type the characters you see in this image",
  "Enter the characters you see below",
  "/errors/validateCaptcha",
  "Robot Check",
];

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  return html.match(re)?.[1]?.trim() || null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Optional live check of a single amazon.in product page.
 *
 * - Disabled unless ENABLE_DIRECT_PAGE_CHECK=true. Only enable it if that is permitted for you.
 * - Makes ONE plain request per call with an honest User-Agent. No proxies, no header spoofing,
 *   no retries against blocks. If Amazon returns a CAPTCHA / robot check / 503 the result is
 *   status "blocked", and nothing is bypassed.
 * - Only extracts identity signals (canonical URL, title, brand, ASIN). It is intentionally
 *   NOT a review scraper.
 */
export class HttpEvidenceSource implements ProductEvidenceSource {
  constructor(
    private readonly enabled: boolean,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async retrieve(candidateUrl: string, _asin: string): Promise<ProductEvidence> {
    const base = { retrievedAt: this.now().toISOString() };
    if (!this.enabled) {
      return { ...base, status: "not_checked", retrievalStatus: "unavailable", dataSourceType: "live_retrieval" };
    }
    let res: Response;
    try {
      res = await this.fetchImpl(candidateUrl, {
        redirect: "follow",
        headers: { "User-Agent": "ReviewLensBot/0.1 (product identity check)", Accept: "text/html" },
      });
    } catch {
      return { ...base, status: "error", retrievalStatus: "failed", dataSourceType: "live_retrieval" };
    }
    const finalUrl = res.url || candidateUrl;
    if (res.status === 404 || res.status === 410) {
      return { ...base, status: "unavailable", retrievalStatus: "unavailable", dataSourceType: "live_retrieval", finalUrl };
    }
    if (res.status === 503 || res.status === 429 || res.status === 403) {
      return { ...base, status: "blocked", retrievalStatus: "failed", dataSourceType: "live_retrieval", finalUrl };
    }
    if (!res.ok) {
      return { ...base, status: "error", retrievalStatus: "failed", dataSourceType: "live_retrieval", finalUrl };
    }
    const html = await res.text();
    if (BLOCK_MARKERS.some((m) => html.includes(m))) {
      return { ...base, status: "blocked", retrievalStatus: "failed", dataSourceType: "live_retrieval", finalUrl };
    }
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? null;
    const titleTag = html.match(/<span[^>]+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const title = titleTag ? decodeEntities(titleTag.replace(/\s+/g, " ").trim()) : metaContent(html, "og:title");
    const asinInPage =
      html.match(/<input[^>]+id=["']ASIN["'][^>]*value=["']([A-Z0-9]{10})["']/i)?.[1]?.toUpperCase() ?? null;
    const brandRaw = html.match(/id=["']bylineInfo["'][^>]*>([\s\S]*?)<\/a>/i)?.[1];
    const brand = brandRaw
      ? decodeEntities(brandRaw.replace(/<[^>]+>/g, " ").replace(/^\s*(Visit the|Brand:)\s*/i, "").replace(/\s+Store\s*$/i, "").replace(/\s+/g, " ").trim()) || null
      : null;

    return {
      ...base,
      status: "ok",
      retrievalStatus: "live",
      dataSourceType: "live_retrieval",
      finalUrl,
      canonicalUrl: canonical,
      // ASIN must come from the page itself. Taking it from the URL would make the identity check circular.
      asin: asinInPage,
      title,
      brand,
    };
  }
}
