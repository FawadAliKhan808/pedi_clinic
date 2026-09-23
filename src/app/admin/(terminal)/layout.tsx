import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/admin/staff-shell";
import { getStaffContext } from "@/lib/auth/staff";

/**
 * Server-side role guard for the whole staff terminal. Role comes from the
 * `staff` table via the API layer — never from the email address or anything
 * the client could set. Owner belongs to a separate dashboard, not here.
 */
export default async function TerminalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const staff = await getStaffContext();

  if (!staff) redirect("/admin/login");
  if (staff.role === "owner") redirect("/owner");

  return <StaffShell role={staff.role}>{children}</StaffShell>;
}
