import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MoreScreen } from "@/components/admin/more-screen";
import { getStaffContext } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "More" };

/** The last tab for doctor and pharmacist: less-used screens, and their account. */
export default async function MorePage() {
  const staff = await getStaffContext();
  if (!staff) redirect("/admin/login");
  if (staff.role === "owner") redirect("/owner");
  return <MoreScreen role={staff.role} />;
}
