import type { ClinicApi, DoctorProfile } from "../../clinic";
import type { TypedSupabaseClient } from "./client.browser";
import { toApiError } from "./errors";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export class SupabaseClinicApi implements ClinicApi {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getDoctorProfile(): Promise<DoctorProfile | null> {
    const { data, error } = await this.client.rpc("doctor_profile");
    if (error) throw toApiError(error, "DOCTOR_PROFILE_FAILED");
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;

    // The setting is hand-editable JSON, so read it defensively.
    const raw = data as Record<string, unknown>;
    return {
      name: text(raw.name),
      photo: text(raw.photo) || null,
      title: text(raw.title),
      experience: text(raw.experience),
      location: text(raw.location),
      qualifications: list(raw.qualifications),
      languages: list(raw.languages),
      expertise: list(raw.expertise),
      highlights: list(raw.highlights),
    };
  }
}
