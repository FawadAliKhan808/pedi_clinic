import type { UUID } from "./types";

/** Every subscribe method returns an unsubscribe function. */
export type Unsubscribe = () => void;

/**
 * "Something changed — refetch." Payloads never carry personal data; each
 * screen refetches its own access-checked read model. `onChange` also fires
 * on (re)subscribe and whenever the app comes back into view, so a dropped
 * connection or a sleeping phone catches up on its own.
 */
export interface RealtimeApi {
  subscribeToQueue(clinicId: UUID, onChange: () => void): Unsubscribe;
  subscribeToPharmacyFeed(clinicId: UUID, onChange: () => void): Unsubscribe;
  /** Sessions opened, changed or cancelled, and bookings made, decided, moved or cancelled. */
  subscribeToAppointments(clinicId: UUID, onChange: () => void): Unsubscribe;
  subscribeToNotifications(userId: UUID, onChange: () => void): Unsubscribe;
}
