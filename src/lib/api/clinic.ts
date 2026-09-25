/** The clinic doctor's public profile, shown to parents ("Know your doctor"). */
export interface DoctorProfile {
  name: string;
  /** A path under /public (or a full URL). */
  photo: string | null;
  title: string;
  experience: string;
  location: string;
  qualifications: string[];
  languages: string[];
  expertise: string[];
  highlights: string[];
}

export interface ClinicApi {
  /** From the `doctor_profile` setting; null if the clinic hasn't set one. Signed-in users. */
  getDoctorProfile(): Promise<DoctorProfile | null>;
}
