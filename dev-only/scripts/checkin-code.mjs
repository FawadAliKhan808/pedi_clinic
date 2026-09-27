/**
 * Parents can only check in with the code from the reception screen's QR.
 * Tests get one the same way the screen does: as the doctor.
 */
import { createClient } from "@supabase/supabase-js";

const DOCTOR_EMAIL = process.env.DEMO_DOCTOR_EMAIL ?? "doctor@pediclinic.test";
const DOCTOR_PASSWORD = process.env.DEMO_DOCTOR_PASSWORD ?? "pedi-doctor-demo";

let doctor = null;

/** This minute's check-in code (valid for a few minutes). */
export async function checkInCode() {
  if (!doctor) {
    doctor = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await doctor.auth.signInWithPassword({
      email: DOCTOR_EMAIL,
      password: DOCTOR_PASSWORD,
    });
    if (error) throw new Error(`doctor sign-in for the check-in code: ${error.message}`);
  }
  const { data, error } = await doctor.rpc("checkin_qr_code");
  if (error) throw new Error(`checkin_qr_code: ${error.message}`);
  return data.code;
}
