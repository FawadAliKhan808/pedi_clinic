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

  /**
   * Race-safe token assignment. Clinic is resolved server-side. Only works
   * with the clinic's check-in code (`checkInCode`, from the printed QR at
   * reception); anything else throws `CHECKIN_CODE_INVALID`, including a code
   * the doctor has since replaced.
   */
  checkIn(input: {
    childId: UUID;
    visitReason: VisitReason;
    checkInCode: string;
    appointmentId?: UUID;
  }): Promise<Visit>;

  /** Staff: the clinic's check-in code, for the printable QR. */
  getCheckInQrCode(): Promise<{ code: string }>;
  /** Doctor: a new check-in code. Every old printout of the QR stops working. */
  replaceCheckInCode(): Promise<{ code: string }>;

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
