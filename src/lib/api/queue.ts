import type {
  ChildSearchResult,
  DoctorQueueEntry,
  ISODateString,
  ParentQueueEntry,
  UUID,
  Visit,
  VisitReason,
} from "./types";

export interface QueueApi {
  /** The signed-in parent's tokens for today, with live position counts. */
  getParentQueueView(): Promise<ParentQueueEntry[]>;
  /** Today's queue for the doctor: skipped cards sort last, completed/removed drop off. */
  getDoctorQueue(clinicId: UUID): Promise<DoctorQueueEntry[]>;

  /** Race-safe token assignment. Clinic is resolved server-side. */
  checkIn(input: {
    childId: UUID;
    visitReason: VisitReason;
    appointmentId?: UUID;
  }): Promise<Visit>;

  /** Calls a child in. Throws `ACTIVE_CONSULTATION_EXISTS` while another consultation is open. */
  call(visitId: UUID): Promise<Visit>;
  /** Same transition as `call` — a skipped or already-called child can be called again. */
  recall(visitId: UUID): Promise<Visit>;
  startConsultation(visitId: UUID): Promise<Visit>;
  skip(visitId: UUID): Promise<Visit>;
  remove(visitId: UUID): Promise<Visit>;

  searchChildren(clinicId: UUID, query: string): Promise<ChildSearchResult[]>;

  /**
   * Doctor-entered walk-in. Finds or creates the parent by phone — no account
   * needed — and the record is claimed automatically when that parent first
   * signs in with the app.
   */
  addWalkIn(input: {
    clinicId: UUID;
    name: string;
    dob: ISODateString;
    parentPhone: string;
    visitReason: VisitReason;
  }): Promise<Visit>;
}
