import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { getServerApi } from "@/lib/api/server";
import { homeFor, staffAreas, type ClinicStaffRole } from "./staff-areas";

/**
 * The caller's staff role, resolved server-side from the `staff` table.
 * Cached per request so nested layout guards don't each re-fetch it.
 */
export const getStaffContext = cache(async () => {
  const api = await getServerApi();
  return api.auth.getStaffRole();
});

/** Where each role's terminal starts. */
export function terminalHomeFor(role: ClinicStaffRole): string {
  return staffAreas[role].home;
}

/**
 * Guard for one role's screens: signed out goes to that role's sign-in page;
 * any other role (or the owner) goes to its own home.
 */
export async function requireStaffArea(role: ClinicStaffRole) {
  const staff = await getStaffContext();
  if (!staff) redirect(staffAreas[role].login);
  if (staff.role !== role) redirect(homeFor(staff.role));
  return { ...staff, role };
}
