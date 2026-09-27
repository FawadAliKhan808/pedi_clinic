import type { AuthApi } from "../../auth";
import { ApiError, type StaffRole, type UUID } from "../../types";
import type { TypedSupabaseClient } from "./client.browser";
import { isStaffRole } from "./mappers";

export class SupabaseAuthApi implements AuthApi {
  constructor(private readonly client: TypedSupabaseClient) {}

  async requestPhoneOtp(phone: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({ phone });
    if (error) throw new ApiError(error.message, "AUTH_OTP_REQUEST_FAILED", error);
  }

  async verifyPhoneOtp(
    phone: string,
    code: string
  ): Promise<{ userId: UUID; isNewUser: boolean }> {
    const { data, error } = await this.client.auth.verifyOtp({
      phone,
      token: code,
      type: "sms",
    });
    if (error || !data.user) {
      throw new ApiError(
        error?.message ?? "OTP verification failed",
        "AUTH_OTP_VERIFY_FAILED",
        error
      );
    }
    return {
      userId: data.user.id,
      isNewUser: data.user.created_at === data.user.last_sign_in_at,
    };
  }

  async signInWithPassword(
    email: string,
    password: string
  ): Promise<{ userId: UUID }> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user) {
      throw new ApiError(
        error?.message ?? "Sign-in failed",
        "AUTH_PASSWORD_SIGNIN_FAILED",
        error
      );
    }
    return { userId: data.user.id };
  }

  async signOut(): Promise<void> {
    this.staffRole = null;
    const { error } = await this.client.auth.signOut();
    if (error) throw new ApiError(error.message, "AUTH_SIGNOUT_FAILED", error);
  }

  /**
   * The signed-in user, from the session's JWT verified against the
   * project's public signing key — no round trip to the Auth server (the key
   * is fetched once and cached). Refreshes an expired session first.
   */
  async getCurrentUserId(): Promise<UUID | null> {
    const { data, error } = await this.client.auth.getClaims();
    if (error || !data) return null;
    return data.claims.sub ?? null;
  }

  async getCurrentEmail(): Promise<string | null> {
    const { data, error } = await this.client.auth.getClaims();
    if (error || !data) return null;
    return typeof data.claims.email === "string" && data.claims.email ? data.claims.email : null;
  }

  async getCurrentPhone(): Promise<string | null> {
    const { data, error } = await this.client.auth.getClaims();
    if (error || !data) return null;
    return typeof data.claims.phone === "string" && data.claims.phone ? data.claims.phone : null;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const email = await this.getCurrentEmail();
    if (!email) throw new ApiError("Not signed in with an email", "NOT_AUTHENTICATED");

    // Proves it's really them (not someone at an unlocked phone) before changing it.
    const check = await this.client.auth.signInWithPassword({ email, password: currentPassword });
    if (check.error) throw new ApiError(check.error.message, "WRONG_PASSWORD", check.error);

    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) {
      const code =
        error.code === "weak_password"
          ? "WEAK_PASSWORD"
          : error.code === "same_password"
            ? "SAME_PASSWORD"
            : "PASSWORD_CHANGE_FAILED";
      throw new ApiError(error.message, code, error);
    }
  }

  async getStaffRole(): Promise<{ role: StaffRole; clinicId: UUID | null } | null> {
    const userId = await this.getCurrentUserId();
    if (!userId) return null;

    // Every staff screen asks; the answer only changes with the account. One
    // lookup per signed-in user for the life of this client (a page load in
    // the browser, a single request on the server).
    if (this.staffRole?.userId !== userId) {
      const lookup = this.lookUpStaffRole(userId);
      this.staffRole = { userId, lookup };
      lookup.catch(() => {
        if (this.staffRole?.lookup === lookup) this.staffRole = null;
      });
    }
    return this.staffRole.lookup;
  }

  private staffRole: {
    userId: UUID;
    lookup: Promise<{ role: StaffRole; clinicId: UUID | null } | null>;
  } | null = null;

  private async lookUpStaffRole(
    userId: UUID
  ): Promise<{ role: StaffRole; clinicId: UUID | null } | null> {
    const { data, error } = await this.client
      .from("staff")
      .select("role, clinic_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new ApiError(error.message, "STAFF_ROLE_LOOKUP_FAILED", error);
    if (!data || !isStaffRole(data.role)) return null;

    return { role: data.role, clinicId: data.clinic_id };
  }
}
