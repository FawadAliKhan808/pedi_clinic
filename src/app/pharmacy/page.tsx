import { redirect } from "next/navigation";
import { requireStaffArea } from "@/lib/auth/staff";
import { staffAreas } from "@/lib/auth/staff-areas";

/** Where "Crescent Pharmacy" opens: sign-in, or straight to the feed. */
export default async function PharmacyIndex() {
  await requireStaffArea("pharmacist");
  redirect(staffAreas.pharmacist.home);
}
