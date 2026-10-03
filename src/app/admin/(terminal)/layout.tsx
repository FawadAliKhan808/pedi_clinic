import type { ReactNode } from "react";
import { StaffShell } from "@/components/admin/staff-shell";
import { requireStaffArea } from "@/lib/auth/staff";

/**
 * The doctor's terminal. Role comes from the `staff` table via the API layer —
 * never from the email address or anything the client could set. Pharmacy and
 * reception have their own areas (/pharmacy, /reception); the owner, /owner.
 */
export default async function DoctorTerminalLayout({ children }: { children: ReactNode }) {
  await requireStaffArea("doctor");
  return <StaffShell role="doctor">{children}</StaffShell>;
}
