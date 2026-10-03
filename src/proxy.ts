import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every navigation so Server
 * Components (notably the /admin role guard) always see a valid session.
 * Kept cheap because it runs before every page.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Refreshes an expired session (writing the new cookies) and verifies the
  // JWT against the project's cached public key — no round trip to the Auth
  // server on every navigation, unlike getUser().
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, generated icons, and the manifest.
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|icons/|manifest.webmanifest|sw.js|splash/).*)",
  ],
};
