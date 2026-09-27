import type { StaffRole, UUID } from "./types";

export interface AuthApi {
  /** Sends a 6-digit SMS OTP to `phone` (E.164). */
  requestPhoneOtp(phone: string): Promise<void>;
  verifyPhoneOtp(
    phone: string,
    code: string
  ): Promise<{ userId: UUID; isNewUser: boolean }>;

  signInWithPassword(email: string, password: string): Promise<{ userId: UUID }>;
  signOut(): Promise<void>;

  getCurrentUserId(): Promise<UUID | null>;
  /** The signed-in account's email (staff sign in with one); null for phone sign-ins. */
  getCurrentEmail(): Promise<string | null>;
  /**
   * Staff: checks `currentPassword` by signing in with it, then sets the new
   * one. Throws `WRONG_PASSWORD`, `WEAK_PASSWORD` (under 6 characters) or
   * `SAME_PASSWORD`.
   */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  /** Server-checked role lookup — never infer role from email or client state. */
  getStaffRole(): Promise<{ role: StaffRole; clinicId: UUID | null } | null>;
}
