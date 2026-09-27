import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckInQrScreen } from "@/components/admin/check-in-qr-screen";
import { getStaffContext } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Check-in QR" };

/**
 * The clinic's check-in QR, to print for reception. Outside the staff
 * terminal's navigation so it prints cleanly. Doctor and pharmacist can print
 * it; only the doctor can replace the code (checked again server-side).
 */
export default async function CheckInQrPage() {
  const staff = await getStaffContext();

  if (!staff) redirect("/admin/login");
  if (staff.role === "owner") redirect("/owner");

  return <CheckInQrScreen canReplace={staff.role === "doctor"} />;
}
