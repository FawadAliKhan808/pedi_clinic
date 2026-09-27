import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckInQrScreen } from "@/components/admin/check-in-qr-screen";
import { getStaffContext } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Check-in QR" };

/**
 * The reception screen: a tablet or laptop at the front desk keeps this open.
 * Full screen, outside the staff terminal's navigation. Doctor and
 * pharmacist logins can open it (the code itself is fetched server-side and
 * checked against their role again).
 */
export default async function CheckInQrPage() {
  const staff = await getStaffContext();

  if (!staff) redirect("/admin/login");
  if (staff.role === "owner") redirect("/owner");

  return <CheckInQrScreen />;
}
