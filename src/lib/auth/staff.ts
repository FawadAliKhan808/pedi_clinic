import "server-only";

import { cache } from "react";
import { getServerApi } from "@/lib/api/server";

/**
 * The caller's staff role, resolved server-side from the `staff` table.
 * Cached per request so nested layout guards don't each re-fetch it.
 */
export const getStaffContext = cache(async () => {
  const api = await getServerApi();
  return api.auth.getStaffRole();
});

/** Where each role's terminal starts. */
export function terminalHomeFor(role: "doctor" | "pharmacist"): string {
  return role === "pharmacist" ? "/admin/feed" : "/admin/queue";
}
