import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { handleGetReviewAnalysis } from "@/lib/handlers";
import { toNextResponse } from "@/lib/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = buildContext();
  const reviewId = req.nextUrl.searchParams.get("reviewId") ?? req.nextUrl.searchParams.get("id") ?? "";
  return toNextResponse(await handleGetReviewAnalysis(ctx, reviewId));
}
