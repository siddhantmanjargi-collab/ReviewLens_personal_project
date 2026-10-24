import { handleImportLink } from "@/lib/handlers";
import { readJson, run } from "@/lib/respond";

export const dynamic = "force-dynamic";

// POST /api/import-link   (header: x-admin-key)
export async function POST(req: Request) {
  const body = await readJson(req);
  const key = req.headers.get("x-admin-key");
  return run((ctx) => handleImportLink(ctx, key, body));
}
