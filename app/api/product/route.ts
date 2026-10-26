import { NextRequest } from "next/server";
import { buildContext } from "@/lib/context";
import { handleGetProduct } from "@/lib/handlers";
import { toNextResponse } from "@/lib/respond";

export async function GET(req: NextRequest) {
  const ctx = buildContext();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  return toNextResponse(await handleGetProduct(ctx, id));
}
