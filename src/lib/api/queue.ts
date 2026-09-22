import type { Child, ISODateString, UUID, Visit, VisitReason } from "./types";

export interface QueueApi {
  /** Today's (IST) queue for a clinic, ordered by token seq. */
  getTodayQueue(clinicId: UUID): Promise<Visit[]>;

  /** Server-side, race-safe token assignment (Phase 2 DB function). */
  checkIn(input: {
    childId: UUID;
    visitReason: VisitReason;
    appointmentId?: UUID;
  }): Promise<Visit>;

  call(visitId: UUID): Promise<Visit>;
  skip(visitId: UUID): Promise<Visit>;
  recall(visitId: UUID): Promise<Visit>;
  remove(visitId: UUID): Promise<Visit>;

  searchChildren(clinicId: UUID, query: string): Promise<Child[]>;

  /**
   * Doctor-entered walk-in. Attaches to `parentPhone`; if no parent account
   * exists yet for that phone the record is claimed automatically on that
   * parent's first OTP login (see docs/BACKEND_CONTRACT.md).
   */
  addWalkIn(input: {
    name: string;
    dob: ISODateString;
    parentPhone: string;
    visitReason: VisitReason;
  }): Promise<Visit>;
}
