import { NextResponse } from "next/server";
import { DEFAULT_GEMINI_MODEL } from "@/lib/config";
import { buildContext } from "@/lib/context";

export async function GET() {
  const ctx = buildContext();
  const products = await ctx.repo.listProducts(1, 0);
  return NextResponse.json({
    status: "ok",
    catalogSeeded: products.length > 0,
    storageMode: process.env.SUPABASE_URL ? "supabase" : "in_memory_catalog",
    analysis: ctx.analysis ? "ready" : "heuristic_fallback",
    analysisMissing: ctx.analysisMissing,
    fallbackReason: ctx.analysis ? undefined : ctx.analysisFallbackReason,
    model: ctx.analysis?.model ?? DEFAULT_GEMINI_MODEL,
    checkedAt: new Date().toISOString(),
  });
}
