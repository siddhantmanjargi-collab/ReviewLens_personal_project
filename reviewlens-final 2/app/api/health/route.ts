import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Reports which settings are present (names only, never values).
export async function GET() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_API_KEY"];
  const forAnalysis = ["GEMINI_API_KEY", "GEMINI_MODEL", "CRON_SECRET"];
  const missingEnv = required.filter((k) => !process.env[k]);
  const missingForAnalysis = forAnalysis.filter((k) => !process.env[k]);
  return NextResponse.json(
    {
      status: missingEnv.length === 0 ? "ok" : "misconfigured",
      missingEnv,
      analysis: missingForAnalysis.length === 0 ? "ready" : "not_configured",
      missingForAnalysis,
    },
    { status: missingEnv.length === 0 ? 200 : 503 },
  );
}
