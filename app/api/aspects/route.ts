import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { handleGetAspects } from "@/lib/handlers";
import { toNextResponse } from "@/lib/respond";

export async function GET(req: NextRequest) {
  const ctx = buildContext();
  const productId = req.nextUrl.searchParams.get("productId") ?? req.nextUrl.searchParams.get("id") ?? "";
  return toNextResponse(await handleGetAspects(ctx, productId));
}
