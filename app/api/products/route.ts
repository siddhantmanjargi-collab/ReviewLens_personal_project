import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { handleListProducts } from "@/lib/handlers";
import { toNextResponse } from "@/lib/respond";

export async function GET(req: NextRequest) {
  const ctx = buildContext();
  return toNextResponse(await handleListProducts(ctx, req.nextUrl.searchParams));
}
