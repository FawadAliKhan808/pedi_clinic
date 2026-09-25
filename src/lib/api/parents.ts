import type { Child, ISODateString, Parent, UUID } from "./types";

export interface ParentsApi {
  /**
   * Claims-or-creates the signed-in user's parent profile from their verified
   * phone number. Idempotent, and the step that links a doctor-created
   * walk-in record (and its children) to the account. Call right after OTP
   * verification; `name` may still be null afterwards.
   */
  ensureProfile(input?: { name?: string }): Promise<Parent>;

  getMyProfile(): Promise<Parent | null>;
  completeProfile(input: { name: string }): Promise<Parent>;

  listMyChildren(): Promise<Child[]>;
  /** Date of birth can't be in the future (INVALID_DOB). */
  addChild(input: { name: string; dob: ISODateString }): Promise<Child>;
  /** Corrects a child's name or date of birth. Own child only. */
  updateChild(childId: UUID, input: { name: string; dob: ISODateString }): Promise<Child>;
  /**
   * Deletes a child added by mistake (and their upcoming bookings). A child
   * who has been to the clinic keeps their records: throws CHILD_HAS_VISITS.
   */
  deleteChild(childId: UUID): Promise<void>;
}
