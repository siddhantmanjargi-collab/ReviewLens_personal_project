import { handleGetAnalysis } from "@/lib/handlers";
import { run } from "@/lib/respond";

export const dynamic = "force-dynamic";

// GET /api/analysis?productId=<product uuid>
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return run((ctx) => handleGetAnalysis(ctx, searchParams.get("productId") ?? ""));
}
