import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/context";
import { heuristicSignals, combineRisk, ratingMismatch, inferLexicalSentiment, inferFallbackAspects } from "@/lib/detector";
import { classifyGeminiError, type GeminiFallbackReason } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const reviewText = body.reviewText?.trim() || "";
    const title = body.title?.trim() || "";
    const rating = Number(body.rating) || 5;
    const productId = typeof body.productId === "string" && body.productId.trim() ? body.productId.trim() : null;

    if (!reviewText) {
      return NextResponse.json({ error: "reviewText is required" }, { status: 400 });
    }

    const ctx = buildContext();
    let fallbackReason: GeminiFallbackReason | undefined = ctx.analysisFallbackReason;

    // Load real product metadata & sibling reviews when productId is selected
    let productInfo = { name: "Sample E-Commerce Item", brand: null as string | null, category: "General" as string | null };
    let siblings: { id: string; text: string; title?: string | null; rating: number; date?: string | null }[] = [];

    if (productId) {
      const product = await ctx.repo.getProduct(productId);
      if (product) {
        productInfo = {
          name: product.productName,
          brand: product.brand,
          category: product.category,
        };
        const existingReviews = await ctx.repo.reviewsForProduct(productId, 100);
        siblings = existingReviews.map((r) => ({
          id: r.id,
          text: r.reviewText,
          title: r.reviewTitle,
          rating: r.rating,
          date: r.reviewDate,
        }));
      }
    }

    const reviewItem = {
      id: "test-1",
      text: reviewText,
      title,
      rating,
      date: new Date().toISOString().slice(0, 10),
    };
    const heur = heuristicSignals(reviewItem, [...siblings, reviewItem]);

    if (ctx.analysis) {
      try {
        const batchOutcome = await ctx.analysis.analyze({
          product: productInfo,
          reviews: [{ id: "test-1", rating, title, text: reviewText }],
        });

        if (batchOutcome.results.length > 0) {
          const res = batchOutcome.results[0]!;
          const mismatch = ratingMismatch(rating, res.sentiment, res.sentimentConfidence);
          const combined = combineRisk({
            heuristicRisk: heur.risk,
            geminiRisk: res.authenticityRisk,
            ratingMismatch: mismatch,
            signals: heur.signals,
          });

          return NextResponse.json({
            reviewText,
            rating,
            title,
            productContext: productId ? productInfo.name : null,
            siblingCount: siblings.length,
            sentiment: res.sentiment,
            sentimentConfidence: res.sentimentConfidence,
            authenticityRisk: combined.risk,
            classification: combined.classification,
            aspects: res.aspects,
            reasoningSignals: res.reasoningSignals,
            heuristicSignals: heur.signals,
            riskBreakdown: combined.breakdown,
            aiPowered: true,
            model: ctx.analysis.model,
          });
        }
      } catch (geminiErr) {
        fallbackReason = classifyGeminiError(geminiErr, process.env.GEMINI_API_KEY);
      }
    }

    // Heuristic fallback if Gemini API key is not configured or fails
    const fallbackSentiment = inferLexicalSentiment(title, reviewText, rating);
    const fallbackMismatch = ratingMismatch(rating, fallbackSentiment, 0.85);
    const combined = combineRisk({
      heuristicRisk: heur.risk,
      geminiRisk: heur.risk,
      ratingMismatch: fallbackMismatch,
      signals: heur.signals,
    });

    return NextResponse.json({
      reviewText,
      rating,
      title,
      productContext: productId ? productInfo.name : null,
      siblingCount: siblings.length,
      sentiment: fallbackSentiment,
      sentimentConfidence: 0.85,
      authenticityRisk: combined.risk,
      classification: combined.classification,
      aspects: inferFallbackAspects(title, reviewText, fallbackSentiment),
      reasoningSignals: heur.signals.filter((s) => s.strength > 0.25).map((s) => s.detail),
      heuristicSignals: heur.signals,
      riskBreakdown: combined.breakdown,
      aiPowered: false,
      fallbackReason,
      model: "heuristics-only",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to analyze review" }, { status: 500 });
  }
}
