import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getStaffContext, terminalHomeFor } from "@/lib/auth/staff";

/** The doctor's screens; a pharmacist signing in lands on their own console. */
export default async function DoctorLayout({ children }: { children: ReactNode }) {
  const staff = await getStaffContext();

  if (!staff) redirect("/admin/login");
  if (staff.role !== "doctor") redirect(terminalHomeFor("pharmacist"));

  return <>{children}</>;
}
