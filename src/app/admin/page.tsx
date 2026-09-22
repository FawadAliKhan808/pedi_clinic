import { redirect } from "next/navigation";
import { getStaffContext, terminalHomeFor } from "@/lib/auth/staff";

export default async function AdminIndex() {
  const staff = await getStaffContext();

  if (!staff || staff.role === "owner") redirect("/admin/login");
  redirect(terminalHomeFor(staff.role));
}
