import type {
  ChildVisitHistoryEntry,
  ConsultedChild,
  DayPatient,
  ISODateString,
  PaymentMode,
  UUID,
  Visit,
  VisitSummary,
  VisitTimelineEntry,
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
  /** Null if the visit isn't visible to the caller. */
  getVisitSummary(visitId: UUID): Promise<VisitSummary | null>;
  /** Newest first. Serves the doctor's child sheet and the parent's records. */
  getChildHistory(childId: UUID): Promise<ChildVisitHistoryEntry[]>;

  /**
   * Ends the consultation in one transaction: photos, fees, split payments and
   * follow-up date are written together, and the visit leaves the queue for
   * the pharmacy feed. Throws `PAYMENT_TOTAL_MISMATCH` unless the payments
   * sum exactly to the fee total.
   */
  completeVisit(input: CompleteVisitInput): Promise<Visit>;

  /**
   * Records the child's weight for a visit (null clears it) and returns what
   * was stored. The parent can do this for their own child's visit while it's
   * in today's queue; the doctor for any visit in the clinic. Throws
   * INVALID_WEIGHT, VISIT_NOT_ACTIVE or NOT_AUTHORIZED.
   */
  recordWeight(visitId: UUID, weightKg: number | null): Promise<number | null>;

  /**
   * Rates the app, not the doctor — once per parent, ever (a second try
   * throws ALREADY_RATED). Clinic staff can never read ratings back.
   */
  submitRating(visitId: UUID, stars: 1 | 2 | 3 | 4 | 5): Promise<void>;
  /** Whether the signed-in parent has already rated the app. */
  hasRatedApp(): Promise<boolean>;

  // --- Doctor: patient history -------------------------------------------

  /** Children whose consultation was completed that day, latest first. Doctor only. */
  listPatientsOn(clinicId: UUID, date: ISODateString): Promise<DayPatient[]>;
  /** Consulted children by child name, parent name or phone. Doctor only. */
  searchConsultedChildren(clinicId: UUID, query: string): Promise<ConsultedChild[]>;
  /** A child's completed consultations, newest first, with fees, payments, prescriptions and medicines. Doctor only. */
  getChildTimeline(childId: UUID): Promise<VisitTimelineEntry[]>;
}
