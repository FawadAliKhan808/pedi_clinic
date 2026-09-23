import { redirect } from "next/navigation";
import { getStaffContext, terminalHomeFor } from "@/lib/auth/staff";

export default async function AdminIndex() {
  const staff = await getStaffContext();

  if (!staff) redirect("/admin/login");
  if (staff.role === "owner") redirect("/owner");
  redirect(terminalHomeFor(staff.role));
}
