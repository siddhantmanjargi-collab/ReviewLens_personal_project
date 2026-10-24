import { handleCron } from "@/lib/handlers";
import { run } from "@/lib/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called once a day by Vercel Cron (see vercel.json). Vercel sends: Authorization: Bearer <CRON_SECRET>
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  return run((ctx) => handleCron(ctx, auth));
}
