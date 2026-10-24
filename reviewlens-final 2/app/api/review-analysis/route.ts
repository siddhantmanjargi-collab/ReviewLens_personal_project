import { handleGetReviewAnalysis } from "@/lib/handlers";
import { run } from "@/lib/respond";

export const dynamic = "force-dynamic";

// GET /api/review-analysis?reviewId=<review uuid>
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return run((ctx) => handleGetReviewAnalysis(ctx, searchParams.get("reviewId") ?? ""));
}
