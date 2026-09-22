import type {
  ChildVisitHistoryEntry,
  ISODateString,
  PaymentMode,
  UUID,
  Visit,
} from "./types";

export interface CompleteVisitInput {
  visitId: UUID;
  /** Any line may be 0; there is no default prefill. */
  fees: { consultation: number; vaccination: number; other: number };
  /** One entry per mode. Must sum exactly to the fee total. */
  payments: { mode: PaymentMode; amount: number }[];
  followUpDate?: ISODateString | null;
  /** Storage keys of already-uploaded photos, in display order (max 3). */
  prescriptionStorageKeys?: string[];
}

export interface VisitsApi {
  getVisit(visitId: UUID): Promise<Visit>;
  /** Newest first. Serves the doctor's child sheet and the parent's records. */
  getChildHistory(childId: UUID): Promise<ChildVisitHistoryEntry[]>;

  /**
   * Ends the consultation in one transaction: photos, fees, split payments and
   * follow-up date are written together, and the visit leaves the queue for
   * the pharmacy feed. Throws `PAYMENT_TOTAL_MISMATCH` unless the payments
   * sum exactly to the fee total.
   */
  completeVisit(input: CompleteVisitInput): Promise<Visit>;

  submitRating(visitId: UUID, stars: 1 | 2 | 3 | 4 | 5): Promise<void>;
}
