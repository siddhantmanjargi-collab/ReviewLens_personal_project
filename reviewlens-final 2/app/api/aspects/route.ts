import { handleGetAspects } from "@/lib/handlers";
import { run } from "@/lib/respond";

export const dynamic = "force-dynamic";

// GET /api/aspects?productId=<product uuid>
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return run((ctx) => handleGetAspects(ctx, searchParams.get("productId") ?? ""));
}
