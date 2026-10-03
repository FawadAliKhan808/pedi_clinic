import { redirect } from "next/navigation";
import { getStaffContext } from "@/lib/auth/staff";
import { homeFor } from "@/lib/auth/staff-areas";

/** Sends each signed-in account to its own home (pharmacy, reception and owner included). */
export default async function AdminIndex() {
  const staff = await getStaffContext();

  if (!staff) redirect("/admin/login");
  redirect(homeFor(staff.role));
}
