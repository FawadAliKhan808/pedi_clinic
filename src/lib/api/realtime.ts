import type { UUID } from "./types";

/** Every subscribe method returns an unsubscribe function. */
export type Unsubscribe = () => void;

export interface RealtimeApi {
  subscribeToQueue(clinicId: UUID, onChange: () => void): Unsubscribe;
  subscribeToPharmacyFeed(clinicId: UUID, onChange: () => void): Unsubscribe;
  subscribeToNotifications(userId: UUID, onChange: () => void): Unsubscribe;
}
