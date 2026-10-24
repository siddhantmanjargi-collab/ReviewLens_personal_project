import { handleAnalyze } from "@/lib/handlers";
import { readJson, run } from "@/lib/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/analyze   (header: x-admin-key)   body (optional): { "limit": 40 }
export async function POST(req: Request) {
  const body = await readJson(req);
  const key = req.headers.get("x-admin-key");
  return run((ctx) => handleAnalyze(ctx, key, body));
}
