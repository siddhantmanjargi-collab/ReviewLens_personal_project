import { handleImportReviews } from "@/lib/handlers";
import { readJson, run } from "@/lib/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/import-reviews?productId=<product uuid>   (header: x-admin-key)
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const body = await readJson(req);
  const key = req.headers.get("x-admin-key");
  return run((ctx) => handleImportReviews(ctx, key, searchParams.get("productId") ?? "", body));
}
