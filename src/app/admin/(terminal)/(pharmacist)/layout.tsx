import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getStaffContext, terminalHomeFor } from "@/lib/auth/staff";

/** The pharmacy console; the doctor lands back on their queue. */
export default async function PharmacistLayout({
  children,
}: {
  children: ReactNode;
}) {
  const staff = await getStaffContext();

  if (!staff) redirect("/admin/login");
  if (staff.role !== "pharmacist") redirect(terminalHomeFor("doctor"));

  return <>{children}</>;
}
