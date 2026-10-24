import { handleImportLinks } from "@/lib/handlers";
import { readJson, run } from "@/lib/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/import-links   (header: x-admin-key)   body: { "items": [ { "link": "...", "productName": "..." } ] }
export async function POST(req: Request) {
  const body = await readJson(req);
  const key = req.headers.get("x-admin-key");
  return run((ctx) => handleImportLinks(ctx, key, body));
}
