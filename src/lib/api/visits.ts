import type { Fees, ISODateString, Payment, UUID, Visit } from "./types";

export interface VisitsApi {
  getVisit(visitId: UUID): Promise<Visit>;
  getChildHistory(childId: UUID): Promise<Visit[]>;

  addPrescriptionImages(visitId: UUID, storageKeys: string[]): Promise<void>;
  setFees(visitId: UUID, fees: Omit<Fees, "visitId">): Promise<Fees>;
  /** Amounts must sum exactly to the fee total — enforced server-side. */
  recordPayments(
    visitId: UUID,
    payments: Omit<Payment, "visitId">[]
  ): Promise<Payment[]>;
  setFollowUpDate(visitId: UUID, date: ISODateString | null): Promise<Visit>;

  /** Transactional: locks in fees/payments, advances the queue, notifies pharmacy. */
  completeVisit(visitId: UUID): Promise<Visit>;

  submitRating(visitId: UUID, stars: 1 | 2 | 3 | 4 | 5): Promise<void>;
}
