// Test helpers for Phase 2. Everything here is fake and used only inside automated tests.
import { MemoryRepository } from "@/lib/memoryRepository";
import { importLinkProduct } from "@/lib/linkImport";
import { importReviews } from "@/lib/reviewImport";
import type { AnalyzeFn, AnalyzeInput } from "@/lib/gemini";
import type { ProductRecord } from "@/lib/types";

export const AMAZON_LINK = "https://www.amazon.in/Some-Phone/dp/B0FIXTURE1/ref=sr_1_1?keywords=x";
export const FLIPKART_LINK = "https://www.flipkart.com/acme-nova/p/itm0000000000001?pid=MOBFIXTURE000001&lid=LSTX";

export async function makeLinkProduct(repo: MemoryRepository, link = AMAZON_LINK, name = "Acme Nova X1 Smartphone"): Promise<ProductRecord> {
  const out = await importLinkProduct({ link, productName: name }, { repo });
  if (out.status !== "created") throw new Error("setup failed: " + JSON.stringify(out));
  return out.product;
}

export async function addPasted(repo: MemoryRepository, productId: string, texts: Array<string | { text: string; rating?: number }>) {
  const reviews = texts.map((t, i) => (typeof t === "string" ? { reviewText: t, rating: 4 } : { reviewText: t.text, rating: t.rating ?? 4 }));
  const out = await importReviews(productId, reviews, "user_pasted", { repo });
  if (out.status !== "ok") throw new Error("setup failed");
  return out;
}

/** A stand-in for Gemini: rating decides sentiment, risk is fixed, one aspect per review. */
export function fakeAnalyze(opts: { risk?: number; calls?: AnalyzeInput[] } = {}): AnalyzeFn {
  return async (input) => {
    opts.calls?.push(input);
    return {
      results: input.reviews.map((r) => ({
        reviewId: r.id,
        sentiment: r.rating >= 4 ? "positive" : r.rating <= 2 ? "negative" : "neutral",
        sentimentConfidence: 0.9,
        authenticityRisk: opts.risk ?? 0.1,
        aspects: [{ name: "battery", sentiment: r.rating >= 4 ? "positive" : "negative", confidence: 0.9 }],
        reasoningSignals: ["fake analyzer"],
      })),
      failed: [],
    };
  };
}
