import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { handleCron } from "@/lib/handlers";
import { toNextResponse } from "@/lib/respond";

export async function GET(req: NextRequest) {
  const ctx = buildContext();
  return toNextResponse(await handleCron(ctx, req.headers.get("authorization")));
}
