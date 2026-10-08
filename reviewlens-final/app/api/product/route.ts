import { handleGetProduct } from "@/lib/handlers";
import { run } from "@/lib/respond";

export const dynamic = "force-dynamic";

// GET /api/product?id=<product uuid>
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return run((ctx) => handleGetProduct(ctx, searchParams.get("id") ?? ""));
}
