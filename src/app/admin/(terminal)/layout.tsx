import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BottomTabs } from "@/components/admin/bottom-tabs";
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

  if (!staff || staff.role === "owner") {
    redirect("/admin/login");
  }

  return (
    <div className="flex flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      {children}
      <BottomTabs role={staff.role} />
    </div>
  );
}
