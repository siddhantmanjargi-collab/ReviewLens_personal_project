import { handleListProducts } from "@/lib/handlers";
import { run } from "@/lib/respond";

export const dynamic = "force-dynamic";

// GET /api/products?limit=25&offset=0
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return run((ctx) => handleListProducts(ctx, searchParams));
}
