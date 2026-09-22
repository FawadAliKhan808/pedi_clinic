import "server-only";

import type { Api } from ".";
import { createSupabaseApi } from "./adapters/supabase";
import { createServerSupabaseClient } from "./adapters/supabase/client.server";

/**
 * For Server Components, Route Handlers, and Server Actions. Creates a
 * fresh, request-scoped client every call — do not cache the result across
 * requests (it's bound to that request's cookies/session).
 */
export async function getServerApi(): Promise<Api> {
  const client = await createServerSupabaseClient();
  return createSupabaseApi(client);
}
