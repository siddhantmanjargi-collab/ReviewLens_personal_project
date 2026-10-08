import { handleImportProduct } from "@/lib/handlers";
import { readJson, run } from "@/lib/respond";

export const dynamic = "force-dynamic";

// POST /api/import-product   (header: x-admin-key)
export async function POST(req: Request) {
  const body = await readJson(req);
  const key = req.headers.get("x-admin-key");
  return run((ctx) => handleImportProduct(ctx, key, body));
}
