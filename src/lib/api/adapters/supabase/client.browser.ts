import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabaseAnonKey, supabaseUrl } from "./env";

export type TypedSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;

/** For Client Components. One instance per browser tab. */
export function createBrowserSupabaseClient(): TypedSupabaseClient {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
