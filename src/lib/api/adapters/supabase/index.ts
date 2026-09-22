import type { Api } from "../..";
import type { AnalyticsApi } from "../../analytics";
import type { AppointmentsApi } from "../../appointments";
import type { NotificationsApi } from "../../notifications";
import type { PharmacyApi } from "../../pharmacy";
import type { StorageApi } from "../../storage";
import type { VisitsApi } from "../../visits";
import { SupabaseAuthApi } from "./auth";
import type { TypedSupabaseClient } from "./client.browser";
import { notImplementedApi } from "./not-implemented";
import { SupabaseParentsApi } from "./parents";
import { SupabaseQueueApi } from "./queue";
import { SupabaseRealtimeApi } from "./realtime";

export * from "./client.browser";
export type { Database } from "./database.types";

/** Assembles the full `Api` surface backed by a single Supabase client. */
export function createSupabaseApi(client: TypedSupabaseClient): Api {
  return {
    auth: new SupabaseAuthApi(client),
    parents: new SupabaseParentsApi(client),
    queue: new SupabaseQueueApi(client),
    realtime: new SupabaseRealtimeApi(client),
    // Built out phase-by-phase as their tables/DB functions land.
    visits: notImplementedApi<VisitsApi>("VisitsApi"),
    pharmacy: notImplementedApi<PharmacyApi>("PharmacyApi"),
    appointments: notImplementedApi<AppointmentsApi>("AppointmentsApi"),
    notifications: notImplementedApi<NotificationsApi>("NotificationsApi"),
    analytics: notImplementedApi<AnalyticsApi>("AnalyticsApi"),
    storage: notImplementedApi<StorageApi>("StorageApi"),
  };
}
