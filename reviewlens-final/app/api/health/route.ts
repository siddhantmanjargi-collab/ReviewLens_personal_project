import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Reports which required secrets are configured (names only, never values).
export async function GET() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_API_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  return NextResponse.json(
    { status: missing.length === 0 ? "ok" : "misconfigured", missingEnv: missing },
    { status: missing.length === 0 ? 200 : 503 },
  );
}
