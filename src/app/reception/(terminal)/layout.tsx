import type { ReactNode } from "react";
import { StaffShell } from "@/components/admin/staff-shell";
import { requireStaffArea } from "@/lib/auth/staff";

/** The front desk's screens: receptionist only; anyone else goes to their own home. */
export default async function ReceptionTerminalLayout({ children }: { children: ReactNode }) {
  await requireStaffArea("receptionist");
  return <StaffShell role="receptionist">{children}</StaffShell>;
}
