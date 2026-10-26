import { NextResponse } from "next/server";
import { resolveAppOrigin } from "@/lib/appOrigin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const isPopup = requestUrl.searchParams.get("popup") === "1";
  const origin = resolveAppOrigin(req);

  let accessToken: string | null = null;
  let authError: string | null = requestUrl.searchParams.get("error_description");

  if (code) {
    const supabase = createServerSupabaseClient(req);
    if (supabase) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        authError = error.message;
      } else {
        accessToken = data.session?.access_token ?? null;
      }
    } else {
      authError = "Supabase public environment variables are not configured.";
    }
  }

  if (isPopup) {
    const payloadJson = JSON.stringify({
      type: "rl-supabase-auth-complete",
      ok: !authError,
      accessToken,
      error: authError,
    });
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>ReviewLens Authentication</title>
  </head>
  <body style="font-family: system-ui, sans-serif; padding: 2rem; text-align: center; background: #0f172a; color: #f8fafc;">
    <p>${authError ? "Authentication could not complete. You can close this window." : "Signed in to ReviewLens. Closing window..."}</p>
    <script>
      (function () {
        var msg = ${payloadJson};
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(msg, "*");
          window.close();
        } else {
          window.location.replace(${JSON.stringify(origin)});
        }
      })();
    </script>
  </body>
</html>`;
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.redirect(origin);
}
