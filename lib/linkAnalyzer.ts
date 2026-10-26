import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { parseAmazonInUrl } from "./asin";
import {
  classifyGeminiError,
  type GeminiFallbackReason,
  getGeminiKeyFallbackReason,
  type GroundedSourceLink,
  sanitizeGeminiApiKey,
} from "./gemini";
import type { Repository } from "./repository";
import type { Marketplace, ProductRecord } from "./types";

export type ReliabilityVerdict = "reliable" | "caution" | "unreliable";
export type PageFetchStatus = "opened" | "bot_protected" | "unreachable";
export type RedFlagSeverity = "high" | "medium" | "positive";

export interface ReliabilitySignalItem {
  label: string;
  severity: RedFlagSeverity;
  detail: string;
}

export interface CatalogAlternativeItem {
  productId: string;
  externalId: string;
  source: Marketplace;
  productName: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  price: number | null;
  mrp: number | null;
  discountPercent: number | null;
  rating: number | null;
  reviewCount: number | null;
  genuinePercent: number;
  imageUrl: string | null;
  remoteImageUrl?: string | null;
  sourceUrl: string | null;
  matchReason: string;
}

export interface LinkAnalysisReport {
  submittedUrl: string;
  finalUrl: string;
  domain: string;
  storeLabel: string;
  marketplace: Marketplace;
  externalId: string;
  pageFetchStatus: PageFetchStatus;
  analysisMode: "live_grounded" | "local_heuristic";
  modelUsed: string;
  fallbackReason?: GeminiFallbackReason;
  checkedAt: string;

  // Extracted / grounded product details
  productName: string;
  brand: string | null;
  model: string | null;
  category: string;
  price: number | null;
  mrp: number | null;
  discountPercent: number | null;
  currency: string;
  rating: number | null;
  reviewCount: number | null;
  availability: string | null;
  imageUrl: string | null;
  specs: Record<string, string | number | boolean>;

  // Core executive summary & reliability verdict
  summary: string;
  verdict: ReliabilityVerdict;
  reliabilityScore: number; // 0 - 100
  reliabilityStatement: string;
  pros: string[];
  cons: string[];
  signals: ReliabilitySignalItem[];
  sources: GroundedSourceLink[];

  // Catalog cross-link & safer alternatives
  matchedCatalogProductId: string | null;
  alternatives: CatalogAlternativeItem[];
}

const KNOWN_DEPARTMENTS = [
  "Smartphones",
  "Laptops",
  "Audio",
  "Wearables",
  "Tablets",
  "Appliances",
  "Accessories",
  "Storage & Wi-Fi",
  "Cameras",
  "TV & Lifestyle",
] as const;

const KNOWN_BRANDS = [
  "Apple",
  "Samsung",
  "OnePlus",
  "Sony",
  "Bose",
  "Sennheiser",
  "JBL",
  "boAt",
  "Nothing",
  "Google",
  "Xiaomi",
  "Redmi",
  "Realme",
  "iQOO",
  "Vivo",
  "Oppo",
  "Motorola",
  "ASUS",
  "Lenovo",
  "HP",
  "Dell",
  "Acer",
  "MSI",
  "LG",
  "Philips",
  "Dyson",
  "Garmin",
  "Amazfit",
  "Noise",
  "Fire-Boltt",
  "Logitech",
  "Keychron",
  "SanDisk",
  "WD",
  "TP-Link",
  "Canon",
  "Nikon",
  "Fujifilm",
  "GoPro",
  "DJI",
  "Marshall",
  "Anker",
  "Belkin",
  "Instant Pot",
  "Agaro",
  "Dreame",
];

const REPUTABLE_STORE_DOMAINS = new Set([
  "amazon.in",
  "amazon.com",
  "flipkart.com",
  "croma.com",
  "reliancedigital.in",
  "vijaysales.com",
  "tatacliq.com",
  "apple.com",
  "samsung.com",
  "oneplus.in",
  "sony.co.in",
  "mi.com",
  "in.nothing.tech",
  "nothing.tech",
  "boat-lifestyle.com",
  "jbl.com",
  "in.jbl.com",
  "lenovo.com",
  "hp.com",
  "dell.com",
  "asus.com",
  "lg.com",
  "philips.co.in",
  "dyson.in",
  "garmin.co.in",
  "logitech.com",
  "headphonezone.in",
  "mdcomputers.in",
  "vedantcomputers.com",
  "primeabgb.com",
]);

function isPrivateOrReservedHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !h ||
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h.startsWith("fc") ||
    h.startsWith("fd") ||
    h.startsWith("fe80:")
  ) {
    return true;
  }

  // IPv4 literal check
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      return true;
    }
  }
  return false;
}

export function normalizeAndValidateProductUrl(
  rawInput: string,
): { ok: true; url: URL } | { ok: false; error: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, error: "Please paste a product URL to inspect." };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { ok: false, error: "That link does not look like a valid webpage URL." };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Only http:// and https:// product links are supported." };
  }

  if (!parsed.hostname.includes(".") || isPrivateOrReservedHost(parsed.hostname)) {
    return { ok: false, error: "Please enter a public online store or product webpage URL." };
  }

  return { ok: true, url: parsed };
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#8377;|&₹;/gi, "₹")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) && n > 31 && n < 127000 ? String.fromCodePoint(n) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "));
}

function parseNumericPrice(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val) && val > 0) {
    return Math.round(val);
  }
  if (typeof val === "string") {
    const cleaned = val.replace(/[^\d.]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n) && n > 0 && n < 10_000_000) {
      return Math.round(n);
    }
  }
  return null;
}

function detectMarketplaceIdentity(urlObj: URL): {
  marketplace: Marketplace;
  externalId: string;
  cleanDomain: string;
  storeLabel: string;
  canonicalUrl: string;
} {
  const host = urlObj.hostname.toLowerCase();
  const cleanDomain = host.replace(/^www\./, "").replace(/^m\./, "");

  if (cleanDomain.endsWith("amazon.in") || cleanDomain === "amzn.in") {
    const parsed = parseAmazonInUrl(urlObj.toString());
    if (parsed.ok && parsed.asin && parsed.canonicalUrl) {
      return {
        marketplace: "amazon.in",
        externalId: parsed.asin,
        cleanDomain: "amazon.in",
        storeLabel: "Amazon.in",
        canonicalUrl: parsed.canonicalUrl,
      };
    }
    const fallbackAsin = urlObj.pathname.match(/\/(?:dp|gp\/product|aw\/d)\/([A-Z0-9]{10})/i)?.[1];
    if (fallbackAsin) {
      const asin = fallbackAsin.toUpperCase();
      return {
        marketplace: "amazon.in",
        externalId: asin,
        cleanDomain: "amazon.in",
        storeLabel: "Amazon.in",
        canonicalUrl: `https://www.amazon.in/dp/${asin}`,
      };
    }
    const hash = createHash("sha1").update(urlObj.toString()).digest("hex").slice(0, 8).toUpperCase();
    return {
      marketplace: "amazon.in",
      externalId: `AMZ${hash}`,
      cleanDomain: "amazon.in",
      storeLabel: "Amazon.in",
      canonicalUrl: urlObj.toString(),
    };
  }

  if (cleanDomain.includes("flipkart.com") || cleanDomain === "fkrt.it") {
    const pid = urlObj.searchParams.get("pid")?.trim();
    const itm = urlObj.pathname.match(/\/(itm[a-z0-9]{8,24})/i)?.[1];
    const extId = (pid || itm || createHash("sha1").update(urlObj.pathname).digest("hex").slice(0, 12))
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 20);
    const clean = new URL(`https://www.flipkart.com${urlObj.pathname}`);
    if (pid) clean.searchParams.set("pid", pid.toUpperCase());
    return {
      marketplace: "flipkart",
      externalId: extId || "FKITEM",
      cleanDomain: "flipkart.com",
      storeLabel: "Flipkart",
      canonicalUrl: clean.toString(),
    };
  }

  const normalized = `${cleanDomain}${urlObj.pathname.replace(/\/+$/, "")}`;
  const webHash = createHash("sha1").update(normalized).digest("hex").slice(0, 8).toUpperCase();
  return {
    marketplace: "web",
    externalId: `WEB-${webHash}`,
    cleanDomain,
    storeLabel: cleanDomain,
    canonicalUrl: urlObj.toString(),
  };
}

function inferDepartment(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(iphone|galaxy\s+[sza]|oneplus\s+\d|pixel\s+\d|smartphone|5g\s+phone|mobile\s+phone|redmi\s+note|iqoo|realme)\b/.test(lower)) {
    return "Smartphones";
  }
  if (/\b(macbook|laptop|thinkpad|vivobook|zenbook|ideapad|inspiron|pavilion|victus|rog\s+strix|notebook)\b/.test(lower)) {
    return "Laptops";
  }
  if (/\b(ipad|galaxy\s+tab|tablet|stylus\s+pad)\b/.test(lower)) {
    return "Tablets";
  }
  if (/\b(watch|smartwatch|fitness\s+band|garmin|amazfit|watch\s+ultra|galaxy\s+watch)\b/.test(lower)) {
    return "Wearables";
  }
  if (/\b(headphone|earbud|airpods|tws|earphone|soundbar|speaker|wh-1000|wf-1000|anc|neckband)\b/.test(lower)) {
    return "Audio";
  }
  if (/\b(camera|mirrorless|dslr|gopro|action\s+cam|lens|instax|gimbal)\b/.test(lower)) {
    return "Cameras";
  }
  if (/\b(ssd|nvme|hard\s+drive|hdd|pendrive|sd\s+card|router|wi-?fi|mesh)\b/.test(lower)) {
    return "Storage & Wi-Fi";
  }
  if (/\b(air\s+fryer|vacuum|purifier|coffee|mixer|kettle|microwave|washing\s+machine|refrigerator|iron|trimmer|appliance)\b/.test(lower)) {
    return "Appliances";
  }
  if (/\b(television|smart\s+tv|qled|oled\s+tv|bravia|projector|monitor)\b/.test(lower)) {
    return "TV & Lifestyle";
  }
  if (/\b(mouse|keyboard|charger|power\s+bank|cable|adapter|hub|case|backpack)\b/.test(lower)) {
    return "Accessories";
  }
  return "Accessories";
}

function inferBrand(text: string): string | null {
  for (const b of KNOWN_BRANDS) {
    const escaped = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) {
      return b;
    }
  }
  return null;
}

function humanizeUrlSlug(urlObj: URL): string | null {
  const segments = urlObj.pathname
    .split("/")
    .map((s) => decodeURIComponent(s).trim())
    .filter(
      (s) =>
        s.length > 3 &&
        !/^(dp|gp|product|products|item|items|p|aw|d|buy|shop|in|en)$/i.test(s) &&
        !/^[A-Z0-9]{10}$/i.test(s) &&
        !/^itm[a-z0-9]+$/i.test(s),
    );
  if (segments.length === 0) return null;
  const best = segments.sort((a, b) => b.length - a.length)[0]!;
  const cleaned = best
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 4) return null;
  return cleaned
    .split(" ")
    .map((word) => {
      if (/^(5g|4g|gb|tb|anc|oled|amoled|qled|ssd|usb|hd|uhd|tv|tws|rgb|wifi|pro|max|ai)$/i.test(word)) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

interface ParsedPageSignals {
  finalUrl: string;
  pageFetchStatus: PageFetchStatus;
  httpStatus: number | null;
  title: string | null;
  description: string | null;
  brand: string | null;
  model: string | null;
  category: string | null;
  price: number | null;
  mrp: number | null;
  currency: string;
  rating: number | null;
  reviewCount: number | null;
  availability: string | null;
  imageUrl: string | null;
  specs: Record<string, string | number | boolean>;
  textExcerpt: string;
}

function findProductNodesInJsonLd(node: unknown, out: Record<string, any>[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) findProductNodesInJsonLd(item, out);
    return;
  }
  const obj = node as Record<string, any>;
  const rawType = obj["@type"];
  const types = Array.isArray(rawType) ? rawType.map(String) : rawType ? [String(rawType)] : [];
  if (types.some((t) => /product/i.test(t))) {
    out.push(obj);
  }
  if (obj["@graph"]) {
    findProductNodesInJsonLd(obj["@graph"], out);
  }
  if (obj.mainEntity) {
    findProductNodesInJsonLd(obj.mainEntity, out);
  }
}

function extractMetaContent(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      "i",
    );
    const m1 = html.match(re1)?.[1];
    if (m1) return decodeHtmlEntities(m1);

    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escaped}["']`,
      "i",
    );
    const m2 = html.match(re2)?.[1];
    if (m2) return decodeHtmlEntities(m2);
  }
  return null;
}

async function fetchAndParseProductPage(targetUrl: URL): Promise<ParsedPageSignals> {
  const empty: ParsedPageSignals = {
    finalUrl: targetUrl.toString(),
    pageFetchStatus: "unreachable",
    httpStatus: null,
    title: null,
    description: null,
    brand: null,
    model: null,
    category: null,
    price: null,
    mrp: null,
    currency: "INR",
    rating: null,
    reviewCount: null,
    availability: null,
    imageUrl: null,
    specs: {},
    textExcerpt: "",
  };

  let res: Response;
  try {
    res = await fetch(targetUrl.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8500),
    });
  } catch {
    return empty;
  }

  // Re-verify final redirected host against SSRF rules
  let finalUrlStr = targetUrl.toString();
  try {
    const redirected = new URL(res.url || targetUrl.toString());
    if (isPrivateOrReservedHost(redirected.hostname)) {
      return empty;
    }
    finalUrlStr = redirected.toString();
  } catch {
    // Keep original URL
  }

  if (res.status === 403 || res.status === 429 || res.status === 503) {
    return {
      ...empty,
      finalUrl: finalUrlStr,
      pageFetchStatus: "bot_protected",
      httpStatus: res.status,
    };
  }

  if (!res.ok) {
    return {
      ...empty,
      finalUrl: finalUrlStr,
      pageFetchStatus: "unreachable",
      httpStatus: res.status,
    };
  }

  let html = "";
  try {
    const raw = await res.text();
    html = raw.slice(0, 450_000);
  } catch {
    return { ...empty, finalUrl: finalUrlStr, httpStatus: res.status };
  }

  // Detect CAPTCHA / bot challenge pages that return HTTP 200
  const lowerSample = html.slice(0, 18_000).toLowerCase();
  if (
    (lowerSample.includes("robot check") && lowerSample.includes("amazon")) ||
    lowerSample.includes("enter the characters you see below") ||
    lowerSample.includes("api-services-support@amazon.com") ||
    (lowerSample.includes("just a moment...") && lowerSample.includes("cloudflare")) ||
    (lowerSample.includes("are you a human") && html.length < 30_000)
  ) {
    return {
      ...empty,
      finalUrl: finalUrlStr,
      pageFetchStatus: "bot_protected",
      httpStatus: res.status,
    };
  }

  // 1. Parse JSON-LD Product schemas
  const productNodes: Record<string, any>[] = [];
  const ldRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch: RegExpExecArray | null;
  while ((ldMatch = ldRegex.exec(html)) !== null) {
    const rawJson = ldMatch[1]?.trim();
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson);
      findProductNodesInJsonLd(parsed, productNodes);
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  let ldTitle: string | null = null;
  let ldDesc: string | null = null;
  let ldBrand: string | null = null;
  let ldModel: string | null = null;
  let ldCategory: string | null = null;
  let ldImage: string | null = null;
  let ldPrice: number | null = null;
  let ldMrp: number | null = null;
  let ldCurrency: string | null = null;
  let ldRating: number | null = null;
  let ldReviewCount: number | null = null;
  let ldAvailability: string | null = null;
  const specs: Record<string, string | number | boolean> = {};

  for (const p of productNodes) {
    if (!ldTitle && typeof p.name === "string") ldTitle = decodeHtmlEntities(p.name);
    if (!ldDesc && typeof p.description === "string") ldDesc = stripTags(p.description).slice(0, 500);
    if (!ldBrand) {
      if (typeof p.brand === "string") ldBrand = decodeHtmlEntities(p.brand);
      else if (typeof p.brand?.name === "string") ldBrand = decodeHtmlEntities(p.brand.name);
    }
    if (!ldModel && typeof (p.model ?? p.mpn ?? p.sku) === "string") {
      ldModel = decodeHtmlEntities(String(p.model ?? p.mpn ?? p.sku)).slice(0, 60);
    }
    if (!ldCategory && typeof p.category === "string") {
      ldCategory = decodeHtmlEntities(p.category);
    }
    if (!ldImage) {
      if (typeof p.image === "string") ldImage = p.image;
      else if (Array.isArray(p.image) && typeof p.image[0] === "string") ldImage = p.image[0];
      else if (typeof p.image?.url === "string") ldImage = p.image.url;
    }

    const offersRaw = Array.isArray(p.offers) ? p.offers[0] : p.offers;
    if (offersRaw && typeof offersRaw === "object") {
      if (!ldPrice) {
        ldPrice = parseNumericPrice(offersRaw.price ?? offersRaw.lowPrice);
      }
      if (!ldMrp) {
        ldMrp = parseNumericPrice(offersRaw.highPrice);
      }
      if (!ldCurrency && typeof offersRaw.priceCurrency === "string") {
        ldCurrency = offersRaw.priceCurrency.toUpperCase();
      }
      if (!ldAvailability && typeof offersRaw.availability === "string") {
        if (/instock/i.test(offersRaw.availability)) ldAvailability = "In Stock";
        else if (/outofstock/i.test(offersRaw.availability)) ldAvailability = "Out of Stock";
        else if (/preorder/i.test(offersRaw.availability)) ldAvailability = "Pre-Order";
      }
    }

    const agg = p.aggregateRating;
    if (agg && typeof agg === "object") {
      const rVal = Number(agg.ratingValue);
      const bVal = Number(agg.bestRating || 5);
      if (!ldRating && Number.isFinite(rVal) && rVal > 0) {
        ldRating = Math.round(((rVal / (bVal > 0 ? bVal : 5)) * 5) * 10) / 10;
      }
      const cVal = Number(String(agg.reviewCount ?? agg.ratingCount ?? "").replace(/[^\d]/g, ""));
      if (!ldReviewCount && Number.isFinite(cVal) && cVal > 0) {
        ldReviewCount = cVal;
      }
    }

    if (Array.isArray(p.additionalProperty)) {
      for (const prop of p.additionalProperty.slice(0, 10)) {
        const k = typeof prop?.name === "string" ? decodeHtmlEntities(prop.name) : "";
        const v = prop?.value !== undefined && prop?.value !== null ? decodeHtmlEntities(String(prop.value)) : "";
        if (k && v && k.length <= 40 && v.length <= 90 && Object.keys(specs).length < 8) {
          specs[k] = v;
        }
      }
    }
  }

  // 2. Parse OpenGraph / HTML meta & <title>
  const ogTitle = extractMetaContent(html, ["og:title", "twitter:title"]);
  const htmlTitleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const rawTagTitle = htmlTitleMatch ? decodeHtmlEntities(htmlTitleMatch) : null;
  const cleanedTitle = (ldTitle || ogTitle || rawTagTitle || "")
    .replace(/\s*(?:\||:|-|–)\s*(?:Amazon\.in|Flipkart\.com|Buy Online.*|Online Shopping.*|Croma.*|Reliance Digital.*)$/i, "")
    .replace(/^Buy\s+/i, "")
    .trim();

  const ogDesc = extractMetaContent(html, ["og:description", "description", "twitter:description"]);
  const ogImage = extractMetaContent(html, ["og:image", "twitter:image"]);
  const metaPrice = parseNumericPrice(
    extractMetaContent(html, ["product:price:amount", "og:price:amount", "price"]),
  );
  const metaCurrency = extractMetaContent(html, ["product:price:currency", "og:price:currency"]);
  const metaBrand = extractMetaContent(html, ["product:brand", "brand"]);

  // 3. Extract inline specification rows from HTML tables if JSON-LD had few specs
  if (Object.keys(specs).length < 6) {
    const rowRe = /<tr[^>]*>\s*<(?:th|td)[^>]*>([\s\S]{2,80}?)<\/(?:th|td)>\s*<td[^>]*>([\s\S]{1,140}?)<\/td>\s*<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(html)) !== null && Object.keys(specs).length < 8) {
      const k = stripTags(rm[1] ?? "").replace(/:$/, "").trim();
      const v = stripTags(rm[2] ?? "").trim();
      if (
        k.length >= 2 &&
        k.length <= 34 &&
        v.length >= 1 &&
        v.length <= 85 &&
        !/^(customer reviews|best sellers|asin|date first|manufacturer|packer|importer|generic name)$/i.test(k)
      ) {
        specs[k] = v;
      }
    }
  }

  // 4. Fallback INR price scan from visible HTML if structured price missing
  let scannedPrice: number | null = null;
  if (!ldPrice && !metaPrice) {
    const rupeeMatch = html.match(/(?:₹|Rs\.?\s?|INR\s?)\s?([1-9][\d,]{2,8})/);
    if (rupeeMatch?.[1]) {
      scannedPrice = parseNumericPrice(rupeeMatch[1]);
    }
  }

  // 5. Visible text excerpt for grounding/heuristics
  const visibleText = stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " "),
  ).slice(0, 3200);

  return {
    finalUrl: finalUrlStr,
    pageFetchStatus: cleanedTitle || visibleText.length > 120 ? "opened" : "unreachable",
    httpStatus: res.status,
    title: cleanedTitle || null,
    description: ldDesc || ogDesc || null,
    brand: ldBrand || metaBrand || null,
    model: ldModel,
    category: ldCategory,
    price: ldPrice ?? metaPrice ?? scannedPrice,
    mrp: ldMrp && (ldPrice ?? metaPrice) && ldMrp > (ldPrice ?? metaPrice)! ? ldMrp : null,
    currency: ldCurrency || metaCurrency || "INR",
    rating: ldRating,
    reviewCount: ldReviewCount,
    availability: ldAvailability,
    imageUrl: ldImage || ogImage || null,
    specs,
    textExcerpt: visibleText,
  };
}

function findMatchingCatalogProduct(
  products: ProductRecord[],
  identity: { marketplace: Marketplace; externalId: string; canonicalUrl: string },
  candidateTitle: string | null,
): ProductRecord | null {
  // 1. Direct ASIN / PID match
  const exact = products.find(
    (p) =>
      p.externalId.toUpperCase() === identity.externalId.toUpperCase() ||
      (p.sourceUrl && p.sourceUrl.toLowerCase().includes(identity.externalId.toLowerCase())),
  );
  if (exact) return exact;

  // 2. Canonical or official URL match
  const cleanTarget = identity.canonicalUrl.replace(/\/+$/, "").toLowerCase();
  const byUrl = products.find((p) => {
    const sUrl = p.sourceUrl?.replace(/\/+$/, "").toLowerCase();
    const oUrl = p.officialUrl?.replace(/\/+$/, "").toLowerCase();
    return sUrl === cleanTarget || oUrl === cleanTarget;
  });
  if (byUrl) return byUrl;

  // 3. High-precision brand + model token match
  if (candidateTitle && candidateTitle.length >= 6) {
    const normCandidate = candidateTitle.toLowerCase();
    for (const p of products) {
      if (p.brand && p.model && p.model.length >= 4) {
        const bLower = p.brand.toLowerCase();
        const mLower = p.model.toLowerCase();
        if (normCandidate.includes(bLower) && normCandidate.includes(mLower)) {
          return p;
        }
      }
    }
  }

  return null;
}

const geminiLinkSchema = z.object({
  productName: z.string().min(2).max(200).optional(),
  brand: z.string().max(60).nullable().optional(),
  model: z.string().max(80).nullable().optional(),
  category: z.string().max(60).optional(),
  priceInr: z.number().nonnegative().nullable().optional(),
  mrpInr: z.number().nonnegative().nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().nonnegative().nullable().optional(),
  specs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  summary: z.string().min(15).max(900),
  verdict: z.enum(["reliable", "caution", "unreliable"]),
  reliabilityScore: z.number().min(0).max(100),
  reliabilityStatement: z.string().min(15).max(650),
  pros: z.array(z.string().min(3).max(200)).min(1).max(6),
  cons: z.array(z.string().min(3).max(200)).min(1).max(6),
  signals: z
    .array(
      z.object({
        label: z.string().min(2).max(90),
        severity: z.enum(["high", "medium", "positive"]),
        detail: z.string().min(4).max(240),
      }),
    )
    .min(1)
    .max(6),
});

function extractJsonObject(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    return JSON.parse(fenced);
  }
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  }
  return JSON.parse(raw);
}

async function synthesizeWithGemini(params: {
  apiKey: string;
  submittedUrl: string;
  finalUrl: string;
  storeLabel: string;
  page: ParsedPageSignals;
  slugTitle: string | null;
  catalogMatch: ProductRecord | null;
  catalogGenuinePct: number | null;
}): Promise<{
  parsed: z.infer<typeof geminiLinkSchema>;
  modelUsed: string;
  sources: GroundedSourceLink[];
}> {
  const sanitizedKey = sanitizeGeminiApiKey(params.apiKey);
  if (!sanitizedKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const ai = new GoogleGenAI({
    apiKey: sanitizedKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  const extractedContext = {
    url: params.finalUrl,
    store: params.storeLabel,
    pageFetchStatus: params.page.pageFetchStatus,
    extractedTitle: params.page.title ?? params.slugTitle ?? params.catalogMatch?.productName ?? null,
    extractedBrand: params.page.brand ?? params.catalogMatch?.brand ?? null,
    extractedPriceInr: params.page.price ?? params.catalogMatch?.price ?? null,
    extractedMrpInr: params.page.mrp ?? params.catalogMatch?.mrp ?? null,
    extractedRating: params.page.rating ?? params.catalogMatch?.rating ?? null,
    extractedReviewCount: params.page.reviewCount ?? params.catalogMatch?.reviewCount ?? null,
    extractedSpecs:
      Object.keys(params.page.specs).length > 0 ? params.page.specs : (params.catalogMatch?.specs ?? {}),
    extractedDescription: params.page.description ?? params.catalogMatch?.description ?? null,
    pageTextExcerpt: params.page.textExcerpt.slice(0, 1800),
    verifiedCatalogGenuinePercent: params.catalogGenuinePct,
  };

  const prompt = [
    "You are an independent consumer product reliability analyst for Indian online shoppers.",
    `Inspect this product link and cross-verify its real-world specifications, pricing in INR, buyer sentiment, and reliability: ${params.finalUrl}`,
    `Server page-open context (JSON data only): ${JSON.stringify(extractedContext)}`,
    "",
    "Evaluate:",
    "1. What the product actually is, its core specifications, and realistic Indian street price (INR).",
    "2. Whether the product and listing are RELIABLE TO BUY ('reliable'), require buyer caution ('caution'), or are high-risk/unreliable ('unreliable').",
    "3. Check for inflated fake-MRP discounts, paid/incentivized review patterns, hardware flaws (thermals, battery drain, hinge/build issues, after-sales service complaints in India), or unknown seller/brand risks.",
    `4. Map category strictly to one of: ${KNOWN_DEPARTMENTS.join(", ")}.`,
    "",
    "Return ONLY a valid JSON object matching this exact structure (no markdown commentary outside the JSON):",
    JSON.stringify({
      productName: "Full commercial product name",
      brand: "Brand name",
      model: "Model identifier or null",
      category: "One of the 10 departments",
      priceInr: 49999,
      mrpInr: 59999,
      rating: 4.4,
      reviewCount: 1250,
      specs: { Processor: "...", Display: "...", Battery: "...", Warranty: "..." },
      summary: "2-3 sentence factual overview of the item, target buyer, and standout hardware/value traits.",
      verdict: "reliable",
      reliabilityScore: 86,
      reliabilityStatement:
        "Explicit 2-sentence buyer statement answering clearly whether this is a reliable product to buy or not, citing concrete reliability reasons.",
      pros: ["3 to 4 concrete strengths confirmed by specs and real buyers"],
      cons: ["2 to 4 concrete limitations or watchouts"],
      signals: [
        {
          label: "Short signal title",
          severity: "positive",
          detail: "1-sentence explanation of the trust signal or red flag.",
        },
      ],
    }),
  ].join("\n");

  const toolConfigs: Array<Array<Record<string, Record<string, never>>>> = [
    [{ urlContext: {} }, { googleSearch: {} }],
    [{ googleSearch: {} }],
  ];
  const models = ["gemini-3.8-flash", "gemini-flash-latest"];
  let lastErr: unknown = null;

  for (const modelName of models) {
    for (const tools of toolConfigs) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            tools: tools as any,
            temperature: 0.2,
          },
        });

        const rawText = (response.text ?? "").trim();
        if (!rawText) {
          throw new Error("Empty Gemini response");
        }

        const jsonCandidate = extractJsonObject(rawText);
        const validated = geminiLinkSchema.parse(jsonCandidate);

        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        const seenUris = new Set<string>();
        const sources: GroundedSourceLink[] = [];
        for (const ch of chunks as { web?: { uri?: string; title?: string } }[]) {
          const uri = ch?.web?.uri;
          if (uri && !seenUris.has(uri)) {
            seenUris.add(uri);
            let fallbackHost = "Web Source";
            try {
              fallbackHost = new URL(uri).hostname.replace(/^www\./, "");
            } catch {}
            sources.push({
              title: ch.web?.title?.trim() || fallbackHost,
              uri,
            });
          }
        }

        return {
          parsed: validated,
          modelUsed: modelName,
          sources: sources.slice(0, 6),
        };
      } catch (err) {
        const reason = classifyGeminiError(err, sanitizedKey);
        if (reason === "invalid_api_key" || reason === "quota_exceeded") {
          throw err;
        }
        lastErr = err;
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Grounded link analysis unavailable");
}

function normalizeDepartment(raw?: string | null, fallbackContext?: string): string {
  if (raw) {
    const exact = KNOWN_DEPARTMENTS.find((d) => d.toLowerCase() === raw.trim().toLowerCase());
    if (exact) return exact;
  }
  return inferDepartment(`${raw ?? ""} ${fallbackContext ?? ""}`);
}

async function selectBetterAlternatives(params: {
  repo: Repository;
  allProducts: ProductRecord[];
  category: string;
  inspectedPrice: number | null;
  excludeProductId: string | null;
  shortlistIds?: string[];
}): Promise<CatalogAlternativeItem[]> {
  const candidates = params.allProducts.filter((p) => p.id !== params.excludeProductId);
  const scored: { item: CatalogAlternativeItem; rankScore: number }[] = [];
  const shortlistSet = new Set(params.shortlistIds ?? []);

  for (const p of candidates) {
    const analysis = await params.repo.getProductAnalysis(p.id);
    const avgRisk = Number((analysis?.details as any)?.averageRisk ?? 0.14);
    const genuinePercent = Math.max(0, Math.min(100, Math.round((1 - avgRisk) * 100)));

    // Only recommend genuinely trustworthy catalog alternatives (>= 78% genuine pattern)
    if (genuinePercent < 78) continue;

    const sameCategory = p.category === params.category;
    let rankScore = genuinePercent * 1.15 + (p.rating ?? 4.2) * 8;
    if (sameCategory) rankScore += 65;
    if (shortlistSet.has(p.id)) rankScore += 8;

    let priceComparisonNote = "";
    if (params.inspectedPrice && p.price) {
      const ratio = Math.abs(p.price - params.inspectedPrice) / Math.max(params.inspectedPrice, 1);
      if (ratio <= 0.35) {
        rankScore += 28;
      } else if (ratio <= 0.65) {
        rankScore += 12;
      } else {
        rankScore -= 10;
      }
      const delta = p.price - params.inspectedPrice;
      if (delta < -250) {
        priceComparisonNote = ` · ₹${Math.abs(delta).toLocaleString("en-IN")} lower`;
      } else if (Math.abs(delta) <= 250) {
        priceComparisonNote = " · Similar price tier";
      }
    }

    const matchReason = `${genuinePercent}% genuine review pattern · ${(p.rating ?? 4.4).toFixed(1)}★ across ${(p.reviewCount ?? 0).toLocaleString("en-IN")} ratings${priceComparisonNote}`;

    scored.push({
      rankScore,
      item: {
        productId: p.id,
        externalId: p.externalId,
        source: p.source,
        productName: p.productName,
        brand: p.brand,
        model: p.model,
        category: p.category,
        price: p.price,
        mrp: p.mrp,
        discountPercent: p.discountPercent,
        rating: p.rating,
        reviewCount: p.reviewCount,
        genuinePercent,
        imageUrl: p.imageUrl,
        remoteImageUrl: p.remoteImageUrl,
        sourceUrl: p.sourceUrl,
        matchReason,
      },
    });
  }

  scored.sort((a, b) => b.rankScore - a.rankScore);
  return scored.slice(0, 3).map((s) => s.item);
}

export async function analyzeProductLink(params: {
  rawUrl: string;
  repo: Repository;
  geminiApiKey?: string | null;
  shortlistIds?: string[];
}): Promise<{ ok: true; report: LinkAnalysisReport } | { ok: false; error: string }> {
  const validatedUrl = normalizeAndValidateProductUrl(params.rawUrl);
  if (!validatedUrl.ok) {
    return { ok: false, error: validatedUrl.error };
  }

  // 1. Open page server-side and parse JSON-LD, OpenGraph, specs, and redirects
  const page = await fetchAndParseProductPage(validatedUrl.url);
  let finalUrlObj = validatedUrl.url;
  try {
    finalUrlObj = new URL(page.finalUrl);
  } catch {}

  const identity = detectMarketplaceIdentity(finalUrlObj);
  const slugTitle = humanizeUrlSlug(finalUrlObj) ?? humanizeUrlSlug(validatedUrl.url);
  const allProducts = await params.repo.listProducts(200, 0);
  const catalogMatch = findMatchingCatalogProduct(
    allProducts,
    identity,
    page.title ?? slugTitle,
  );

  let catalogGenuinePct: number | null = null;
  let catalogAspects: { aspectName: string; positiveCount: number; negativeCount: number; mentionCount: number }[] = [];
  if (catalogMatch) {
    const [ana, aspects] = await Promise.all([
      params.repo.getProductAnalysis(catalogMatch.id),
      params.repo.listProductAspects(catalogMatch.id),
    ]);
    const avgRisk = Number((ana?.details as any)?.averageRisk ?? 0.14);
    catalogGenuinePct = Math.max(0, Math.min(100, Math.round((1 - avgRisk) * 100)));
    catalogAspects = aspects;
  }

  const keyIssue = getGeminiKeyFallbackReason(params.geminiApiKey);
  let fallbackReason: GeminiFallbackReason | undefined = keyIssue ?? undefined;

  // 2. Attempt live Gemini 3.8 Flash grounded synthesis (URL Context + Google Search)
  if (!keyIssue && params.geminiApiKey) {
    try {
      const grounded = await synthesizeWithGemini({
        apiKey: params.geminiApiKey,
        submittedUrl: validatedUrl.url.toString(),
        finalUrl: page.finalUrl,
        storeLabel: identity.storeLabel,
        page,
        slugTitle,
        catalogMatch,
        catalogGenuinePct,
      });

      const g = grounded.parsed;
      const resolvedName =
        g.productName?.trim() ||
        page.title ||
        catalogMatch?.productName ||
        slugTitle ||
        `${identity.storeLabel} Product (${identity.externalId})`;
      const resolvedBrand =
        g.brand?.trim() ||
        page.brand ||
        catalogMatch?.brand ||
        inferBrand(resolvedName);
      const resolvedCategory = normalizeDepartment(
        g.category,
        `${resolvedName} ${page.category ?? ""} ${catalogMatch?.category ?? ""}`,
      );
      const resolvedPrice = g.priceInr ?? page.price ?? catalogMatch?.price ?? null;
      const rawMrp = g.mrpInr ?? page.mrp ?? catalogMatch?.mrp ?? null;
      const resolvedMrp = rawMrp && resolvedPrice && rawMrp > resolvedPrice ? rawMrp : null;
      const discountPercent =
        resolvedPrice && resolvedMrp
          ? Math.round(((resolvedMrp - resolvedPrice) / resolvedMrp) * 100)
          : (catalogMatch?.discountPercent ?? null);

      const mergedSpecs: Record<string, string | number | boolean> = {
        ...(catalogMatch?.specs ?? {}),
        ...page.specs,
        ...(g.specs ?? {}),
      };

      const alternatives = await selectBetterAlternatives({
        repo: params.repo,
        allProducts,
        category: resolvedCategory,
        inspectedPrice: resolvedPrice,
        excludeProductId: catalogMatch?.id ?? null,
        shortlistIds: params.shortlistIds,
      });

      return {
        ok: true,
        report: {
          submittedUrl: validatedUrl.url.toString(),
          finalUrl: page.finalUrl,
          domain: identity.cleanDomain,
          storeLabel: identity.storeLabel,
          marketplace: identity.marketplace,
          externalId: catalogMatch?.externalId ?? identity.externalId,
          pageFetchStatus: page.pageFetchStatus,
          analysisMode: "live_grounded",
          modelUsed: grounded.modelUsed,
          checkedAt: new Date().toISOString(),
          productName: resolvedName,
          brand: resolvedBrand,
          model: g.model ?? page.model ?? catalogMatch?.model ?? null,
          category: resolvedCategory,
          price: resolvedPrice,
          mrp: resolvedMrp,
          discountPercent,
          currency: page.currency || "INR",
          rating: g.rating ?? page.rating ?? catalogMatch?.rating ?? null,
          reviewCount: g.reviewCount ?? page.reviewCount ?? catalogMatch?.reviewCount ?? null,
          availability: page.availability ?? catalogMatch?.availability ?? "Check Storefront",
          imageUrl: catalogMatch?.imageUrl ?? page.imageUrl ?? null,
          specs: mergedSpecs,
          summary: g.summary,
          verdict: g.verdict,
          reliabilityScore: Math.round(g.reliabilityScore),
          reliabilityStatement: g.reliabilityStatement,
          pros: g.pros,
          cons: g.cons,
          signals: g.signals,
          sources: grounded.sources,
          matchedCatalogProductId: catalogMatch?.id ?? null,
          alternatives,
        },
      };
    } catch (err) {
      fallbackReason = classifyGeminiError(err, params.geminiApiKey);
    }
  }

  // 3. Seamless Deterministic Local Synthesis (Page HTML/JSON-LD + Catalog Forensics + Store/Price Heuristics)
  const resolvedName =
    page.title ||
    catalogMatch?.productName ||
    slugTitle ||
    `${identity.storeLabel} Listing (${identity.externalId})`;
  const resolvedBrand =
    page.brand ||
    catalogMatch?.brand ||
    inferBrand(`${resolvedName} ${page.textExcerpt.slice(0, 400)}`);
  const resolvedCategory = normalizeDepartment(
    catalogMatch?.category ?? page.category,
    `${resolvedName} ${page.description ?? ""} ${page.textExcerpt.slice(0, 500)}`,
  );
  const resolvedPrice = page.price ?? catalogMatch?.price ?? null;
  const rawMrp = page.mrp ?? catalogMatch?.mrp ?? null;
  const resolvedMrp = rawMrp && resolvedPrice && rawMrp > resolvedPrice ? rawMrp : null;
  const discountPercent =
    resolvedPrice && resolvedMrp
      ? Math.round(((resolvedMrp - resolvedPrice) / resolvedMrp) * 100)
      : (catalogMatch?.discountPercent ?? null);
  const resolvedRating = page.rating ?? catalogMatch?.rating ?? null;
  const resolvedReviewCount = page.reviewCount ?? catalogMatch?.reviewCount ?? null;
  const mergedSpecs: Record<string, string | number | boolean> = {
    ...(catalogMatch?.specs ?? {}),
    ...page.specs,
  };

  const signals: ReliabilitySignalItem[] = [];
  let score = 68;

  // Storefront reputation signal
  const isReputableDomain =
    REPUTABLE_STORE_DOMAINS.has(identity.cleanDomain) ||
    Array.from(REPUTABLE_STORE_DOMAINS).some((d) => identity.cleanDomain.endsWith(`.${d}`));

  if (isReputableDomain) {
    score += 10;
    signals.push({
      label: `Recognized Storefront (${identity.storeLabel})`,
      severity: "positive",
      detail: `Hosted on ${identity.cleanDomain} with standard buyer return/fulfillment protections.`,
    });
  } else {
    score -= 14;
    signals.push({
      label: `Unfamiliar Storefront (${identity.cleanDomain})`,
      severity: "medium",
      detail: "Independent web domain — verify official warranty authorization, GST invoice support, and return terms before paying.",
    });
  }

  // Catalog forensic match signal
  if (catalogMatch && catalogGenuinePct !== null) {
    if (catalogGenuinePct >= 82) {
      score = Math.max(score, catalogGenuinePct);
      signals.push({
        label: `Audited Catalog Match (${catalogGenuinePct}% Genuine Pattern)`,
        severity: "positive",
        detail: `Cross-matched with ReviewLens's verified ${catalogMatch.externalId} audit showing consistent, detail-rich buyer reviews.`,
      });
    } else if (catalogGenuinePct >= 68) {
      score = Math.min(score, catalogGenuinePct + 4);
      signals.push({
        label: `Moderate Review Suspicion (${100 - catalogGenuinePct}% Risk)`,
        severity: "medium",
        detail: "ReviewLens audit detected mixed promotional phrasing or star-sentiment divergence on this listing.",
      });
    } else {
      score = Math.min(score, catalogGenuinePct);
      signals.push({
        label: `Elevated Shill / Fake-Review Risk (${100 - catalogGenuinePct}% Risk)`,
        severity: "high",
        detail: "High concentration of repetitive, low-specificity 5-star reviews detected in our forensic audit.",
      });
    }
  }

  // Page fetch & structured metadata signal
  if (page.pageFetchStatus === "opened") {
    const specCount = Object.keys(mergedSpecs).length;
    if (specCount >= 3 || page.description) {
      score += 6;
      signals.push({
        label: "Structured Product Schema Verified",
        severity: "positive",
        detail: `Opened product page directly and extracted ${specCount > 0 ? `${specCount} technical specifications` : "structured product metadata"}.`,
      });
    }
  } else if (page.pageFetchStatus === "bot_protected" && !catalogMatch) {
    score -= 6;
    signals.push({
      label: "Marketplace Bot Wall Encountered",
      severity: "medium",
      detail: `${identity.storeLabel} throttled raw HTML scraping; product profile was reconstructed from URL structure and local heuristics.`,
    });
  } else if (page.pageFetchStatus === "unreachable" && !catalogMatch) {
    score -= 16;
    signals.push({
      label: "Product Page Unreachable",
      severity: "high",
      detail: "The target webpage could not be opened directly — double-check that the listing is still active and in stock.",
    });
  }

  // Brand & model transparency
  if (resolvedBrand) {
    score += 5;
  } else {
    score -= 10;
    signals.push({
      label: "Unbranded or Generic Listing",
      severity: "medium",
      detail: "No established manufacturer brand or verifiable model code was detected on the listing.",
    });
  }

  // Discount realism check
  if (discountPercent !== null && discountPercent >= 68) {
    score -= 12;
    signals.push({
      label: `Steep ${discountPercent}% MRP Discount Framing`,
      severity: "high",
      detail: "Discounts above 65% off MRP on Indian marketplaces often reflect artificially inflated reference MRPs rather than genuine price drops.",
    });
  } else if (discountPercent !== null && discountPercent > 0 && discountPercent <= 45) {
    score += 3;
  }

  // Rating & review depth check
  if (resolvedRating !== null) {
    if (resolvedRating >= 4.2 && (resolvedReviewCount ?? 100) >= 50) {
      score += 6;
      signals.push({
        label: `Strong Buyer Consensus (${resolvedRating.toFixed(1)}★)`,
        severity: "positive",
        detail: `Backed by ${(resolvedReviewCount ?? 0).toLocaleString("en-IN")} customer ratings above the 4.2★ reliability benchmark.`,
      });
    } else if (resolvedRating < 3.7) {
      score -= 18;
      signals.push({
        label: `Below-Average Customer Rating (${resolvedRating.toFixed(1)}★)`,
        severity: "high",
        detail: "Listings rated below 3.7★ frequently suffer from recurring quality-control defects or mismatched specifications.",
      });
    }
  }
  if (resolvedReviewCount !== null && resolvedReviewCount > 0 && resolvedReviewCount < 25) {
    score -= 8;
    signals.push({
      label: `Low Review Sample (${resolvedReviewCount} Ratings)`,
      severity: "medium",
      detail: "Small rating volume makes average star scores volatile and easier for early incentivized reviews to skew.",
    });
  }

  const reliabilityScore = Math.max(18, Math.min(96, Math.round(score)));
  const verdict: ReliabilityVerdict =
    reliabilityScore >= 76 ? "reliable" : reliabilityScore >= 52 ? "caution" : "unreliable";

  // Pros & Cons synthesis
  const pros: string[] = [];
  const cons: string[] = [];

  if (catalogAspects.length > 0) {
    for (const a of catalogAspects.filter((x) => x.positiveCount > x.negativeCount).slice(0, 3)) {
      pros.push(`Verified buyers consistently praise ${a.aspectName} (${a.positiveCount}/${a.mentionCount} positive mentions)`);
    }
    for (const a of catalogAspects.filter((x) => x.negativeCount > 0).slice(0, 3)) {
      cons.push(`Watch out for mixed feedback on ${a.aspectName} (${a.negativeCount}/${a.mentionCount} critical mentions)`);
    }
  }

  const specPreview = Object.entries(mergedSpecs).slice(0, 3);
  if (pros.length < 3) {
    if (resolvedBrand) {
      pros.push(`Backed by ${resolvedBrand} hardware ecosystem and standard manufacturer support in ${resolvedCategory}`);
    }
    if (specPreview.length > 0) {
      pros.push(
        `Published key specs include ${specPreview.map(([k, v]) => `${k}: ${v}`).join(", ")}`,
      );
    }
    if (resolvedPrice !== null) {
      pros.push(
        `Clear upfront pricing at ₹${resolvedPrice.toLocaleString("en-IN")}${discountPercent ? ` (${discountPercent}% below ₹${resolvedMrp?.toLocaleString("en-IN")} MRP)` : ""}`,
      );
    }
    if (isReputableDomain) {
      pros.push(`Listed on ${identity.storeLabel} with platform order tracking and return window`);
    }
  }

  if (cons.length < 2) {
    if (discountPercent !== null && discountPercent >= 65) {
      cons.push(`Heavy ${discountPercent}% discount claim warrants checking historical street price before buying`);
    }
    if (!resolvedPrice) {
      cons.push("Live selling price was not exposed in public page metadata — confirm variant pricing at checkout");
    }
    if (page.pageFetchStatus === "bot_protected" && !catalogMatch) {
      cons.push(`${identity.storeLabel} blocked full HTML review scraping — verify seller badge ('Cocoblu'/'Appario'/'RetailNet') on listing`);
    }
    if (Object.keys(mergedSpecs).length === 0) {
      cons.push("Detailed hardware specification table was sparse on the target page — confirm exact model SKU");
    }
    cons.push(`Compare warranty coverage and genuine-adjusted ratings against top ${resolvedCategory} alternatives below`);
  }

  const summaryParts = [
    `${resolvedName}${resolvedBrand ? ` by ${resolvedBrand}` : ""} is a ${resolvedCategory.toLowerCase()} listing on ${identity.storeLabel}${resolvedPrice !== null ? ` priced at ₹${resolvedPrice.toLocaleString("en-IN")}` : ""}.`,
    page.description
      ? page.description.slice(0, 240)
      : specPreview.length > 0
        ? `Highlighted specifications include ${specPreview.map(([k, v]) => `${k} (${v})`).join(", ")}.`
        : `Inspected via URL structure, storefront trust signals, and ${resolvedCategory} category benchmarks.`,
  ];
  const summary = summaryParts.join(" ");

  let reliabilityStatement: string;
  if (verdict === "reliable") {
    reliabilityStatement = `Yes — ${resolvedName} appears to be a reliable product to buy (${reliabilityScore}/100 trust score). Its brand identity, ${isReputableDomain ? `${identity.storeLabel} storefront provenance, ` : ""}and specification profile align cleanly with trustworthy ${resolvedCategory.toLowerCase()} listings; just confirm an authorized seller at checkout.`;
  } else if (verdict === "caution") {
    reliabilityStatement = `Proceed with caution — ${resolvedName} scores ${reliabilityScore}/100 on our reliability check and has caveats worth verifying before you buy. Double-check the seller's authorization, real street price history, and recent verified-purchase 3-star reviews, or compare it against the higher-trust ${resolvedCategory.toLowerCase()} alternatives below.`;
  } else {
    reliabilityStatement = `Not recommended without extra verification — ${resolvedName} scores ${reliabilityScore}/100 due to elevated listing or review risk signals. We strongly advise comparing the verified ${resolvedCategory.toLowerCase()} alternatives below rather than ordering blind from this link.`;
  }

  const alternatives = await selectBetterAlternatives({
    repo: params.repo,
    allProducts,
    category: resolvedCategory,
    inspectedPrice: resolvedPrice,
    excludeProductId: catalogMatch?.id ?? null,
    shortlistIds: params.shortlistIds,
  });

  return {
    ok: true,
    report: {
      submittedUrl: validatedUrl.url.toString(),
      finalUrl: page.finalUrl,
      domain: identity.cleanDomain,
      storeLabel: identity.storeLabel,
      marketplace: identity.marketplace,
      externalId: catalogMatch?.externalId ?? identity.externalId,
      pageFetchStatus: page.pageFetchStatus,
      analysisMode: "local_heuristic",
      modelUsed: "deterministic-link-inspector-v1",
      fallbackReason,
      checkedAt: new Date().toISOString(),
      productName: resolvedName,
      brand: resolvedBrand,
      model: page.model ?? catalogMatch?.model ?? null,
      category: resolvedCategory,
      price: resolvedPrice,
      mrp: resolvedMrp,
      discountPercent,
      currency: page.currency || "INR",
      rating: resolvedRating,
      reviewCount: resolvedReviewCount,
      availability: page.availability ?? catalogMatch?.availability ?? "Check Storefront",
      imageUrl: catalogMatch?.imageUrl ?? page.imageUrl ?? null,
      specs: mergedSpecs,
      summary,
      verdict,
      reliabilityScore,
      reliabilityStatement,
      pros: pros.slice(0, 4),
      cons: cons.slice(0, 4),
      signals: signals.slice(0, 5),
      sources: [],
      matchedCatalogProductId: catalogMatch?.id ?? null,
      alternatives,
    },
  };
}
