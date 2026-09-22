import type { AnalyticsApi } from "./analytics";
import type { AppointmentsApi } from "./appointments";
import type { AuthApi } from "./auth";
import type { NotificationsApi } from "./notifications";
import type { ParentsApi } from "./parents";
import type { PharmacyApi } from "./pharmacy";
import type { QueueApi } from "./queue";
import type { RealtimeApi } from "./realtime";
import type { StorageApi } from "./storage";
import type { VisitsApi } from "./visits";

/**
 * The one surface pages/components are allowed to talk to for data access —
 * no page or component may import a backend SDK (e.g. the Supabase client)
 * directly. Swapping backends means writing a new implementation of this
 * interface, not rewriting the app. See docs/BACKEND_CONTRACT.md.
 */
export interface Api {
  auth: AuthApi;
  parents: ParentsApi;
  queue: QueueApi;
  visits: VisitsApi;
  pharmacy: PharmacyApi;
  appointments: AppointmentsApi;
  notifications: NotificationsApi;
  analytics: AnalyticsApi;
  storage: StorageApi;
  realtime: RealtimeApi;
}

export * from "./analytics";
export * from "./appointments";
export * from "./auth";
export * from "./notifications";
export * from "./parents";
export * from "./pharmacy";
export * from "./queue";
export * from "./realtime";
export * from "./storage";
export * from "./types";
export * from "./visits";
