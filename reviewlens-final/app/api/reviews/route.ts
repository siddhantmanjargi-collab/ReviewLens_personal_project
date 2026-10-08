import { handleListReviews } from "@/lib/handlers";
import { run } from "@/lib/respond";

export const dynamic = "force-dynamic";

// GET /api/reviews?productId=<product uuid>&limit=25&offset=0
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return run((ctx) => handleListReviews(ctx, searchParams.get("productId") ?? "", searchParams));
}
