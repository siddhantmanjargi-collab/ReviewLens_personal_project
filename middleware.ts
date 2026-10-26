import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  const pub = getSupabasePublicEnv();
  if (!pub) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isHttps = forwardedProto
    ? forwardedProto.split(",")[0]!.trim().toLowerCase() === "https"
    : request.nextUrl.protocol === "https:";

  const supabase = createServerClient(pub.url, pub.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({
          request,
        });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, {
            ...options,
            sameSite: isHttps ? "none" : (options?.sameSite ?? "lax"),
            secure: isHttps ? true : options?.secure,
          });
        }
      },
    },
  });

  // Refreshes expired Auth tokens automatically on every matched request
  try {
    await supabase.auth.getUser();
  } catch {
    // Allow request to proceed cleanly if Supabase network call fails transiently
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
