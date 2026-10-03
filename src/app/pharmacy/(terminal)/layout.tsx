import type { ReactNode } from "react";
import { StaffShell } from "@/components/admin/staff-shell";
import { requireStaffArea } from "@/lib/auth/staff";

/** The pharmacy's screens: pharmacist only; anyone else goes to their own home. */
export default async function PharmacyTerminalLayout({ children }: { children: ReactNode }) {
  await requireStaffArea("pharmacist");
  return <StaffShell role="pharmacist">{children}</StaffShell>;
}
