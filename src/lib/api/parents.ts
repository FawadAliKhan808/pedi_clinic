import type { Child, ISODateString, Parent } from "./types";

export interface ParentsApi {
  /** Null until the parent has completed the first-login name step. */
  getMyProfile(): Promise<Parent | null>;
  completeProfile(input: { name: string }): Promise<Parent>;

  listMyChildren(): Promise<Child[]>;
  addChild(input: { name: string; dob: ISODateString }): Promise<Child>;
}
