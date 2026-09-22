import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import type { TypedSupabaseClient } from "./client.browser";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * For Server Components, Route Handlers, and Server Actions. Must be
 * created per-request (it closes over that request's cookies) — never
 * cache or share the return value across requests.
 */
export async function createServerSupabaseClient(): Promise<TypedSupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render, where cookies are
          // read-only — safe to ignore since middleware refreshes sessions.
        }
      },
    },
  });
}

/**
 * Service-role client: bypasses RLS entirely. Reserved for admin scripts,
 * scheduled jobs, and the rare trusted operation a policy can't express —
 * never used to serve an ordinary user request.
 */
export function createServiceRoleSupabaseClient(): TypedSupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing env var SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient<Database>(supabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
