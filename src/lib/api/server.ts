import "server-only";

import type { Api } from ".";
import { createSupabaseApi } from "./adapters/supabase";
import { createServerSupabaseClient } from "./adapters/supabase/client.server";
import {
  dispatchPendingPushes,
  type DispatchResult,
} from "./adapters/supabase/push-dispatch";

/**
 * For Server Components, Route Handlers, and Server Actions. Creates a
 * fresh, request-scoped client every call — do not cache the result across
 * requests (it's bound to that request's cookies/session).
 */
export async function getServerApi(): Promise<Api> {
  const client = await createServerSupabaseClient();
  return createSupabaseApi(client);
}

/** Server-only: pushes notifications waiting to go out. See push-dispatch. */
export function dispatchPendingNotifications(): Promise<DispatchResult> {
  return dispatchPendingPushes();
}

export type { DispatchResult };
