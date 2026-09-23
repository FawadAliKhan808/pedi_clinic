import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getStaffContext } from "@/lib/auth/staff";

/**
 * Server-side guard for the owner dashboard. Role comes from the `staff`
 * table; clinic staff are sent back to their own terminal.
 */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const staff = await getStaffContext();

  if (!staff) redirect("/owner/login");
  if (staff.role !== "owner") redirect("/admin");

  return <>{children}</>;
}
