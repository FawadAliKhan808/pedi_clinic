import "client-only";

import type { Api } from ".";
import { createBrowserSupabaseClient, createSupabaseApi } from "./adapters/supabase";

let cached: Api | null = null;

/** For Client Components. Memoized per browser tab. */
export function getBrowserApi(): Api {
  if (!cached) {
    cached = createSupabaseApi(createBrowserSupabaseClient());
  }
  return cached;
}
