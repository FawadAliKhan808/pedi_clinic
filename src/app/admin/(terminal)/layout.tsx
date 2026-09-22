import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BottomTabs } from "@/components/admin/bottom-tabs";
import { EmptyState } from "@/components/ui/feedback";
import { getServerApi } from "@/lib/api/server";

/**
 * Server-side role guard. Role comes from the `staff` table via the API layer
 * — never from the email address or anything the client could set.
 */
export default async function TerminalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const api = await getServerApi();
  const staff = await api.auth.getStaffRole();

  if (!staff || staff.role === "owner") {
    redirect("/admin/login");
  }

  if (staff.role === "pharmacist") {
    return (
      <EmptyState
        title="Pharmacy console coming soon"
        description="The pharmacy feed and stock screens arrive in the next build phase."
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      {children}
      <BottomTabs />
    </div>
  );
}
