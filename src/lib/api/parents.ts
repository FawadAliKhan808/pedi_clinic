import type { Child, ISODateString, Parent } from "./types";

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
  addChild(input: { name: string; dob: ISODateString }): Promise<Child>;
}
