import type { Api } from "../..";
import { SupabaseAnalyticsApi } from "./analytics";
import { SupabaseAppointmentsApi } from "./appointments";
import { SupabaseAuthApi } from "./auth";
import { SupabaseClinicApi } from "./clinic";
import type { TypedSupabaseClient } from "./client.browser";
import { SupabaseNotificationsApi } from "./notifications";
import { SupabaseParentsApi } from "./parents";
import { SupabasePharmacyApi } from "./pharmacy";
import { SupabaseQueueApi } from "./queue";
import { SupabaseRealtimeApi } from "./realtime";
import { SupabaseStorageApi } from "./storage";
import { SupabaseVisitsApi } from "./visits";

export * from "./client.browser";
export type { Database } from "./database.types";

/** Assembles the full `Api` surface backed by a single Supabase client. */
export function createSupabaseApi(client: TypedSupabaseClient): Api {
  return {
    auth: new SupabaseAuthApi(client),
    clinic: new SupabaseClinicApi(client),
    parents: new SupabaseParentsApi(client),
    queue: new SupabaseQueueApi(client),
    realtime: new SupabaseRealtimeApi(client),
    visits: new SupabaseVisitsApi(client),
    storage: new SupabaseStorageApi(client),
    pharmacy: new SupabasePharmacyApi(client),
    notifications: new SupabaseNotificationsApi(client),
    appointments: new SupabaseAppointmentsApi(client),
    analytics: new SupabaseAnalyticsApi(client),
  };
}
