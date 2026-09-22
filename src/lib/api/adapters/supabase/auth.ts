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
    const { error } = await this.client.auth.signOut();
    if (error) throw new ApiError(error.message, "AUTH_SIGNOUT_FAILED", error);
  }

  async getCurrentUserId(): Promise<UUID | null> {
    const { data, error } = await this.client.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  }

  async getStaffRole(): Promise<{ role: StaffRole; clinicId: UUID | null } | null> {
    const userId = await this.getCurrentUserId();
    if (!userId) return null;

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
