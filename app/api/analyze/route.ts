import { NextRequest } from "next/server";
import { readAdminKey } from "@/lib/auth";
import { buildContext } from "@/lib/context";
import { handleAnalyze } from "@/lib/handlers";
import { toNextResponse } from "@/lib/respond";

export async function POST(req: NextRequest) {
  const ctx = buildContext();
  const body = await req.json().catch(() => ({}));
  return toNextResponse(await handleAnalyze(ctx, readAdminKey(req.headers), body));
}
