import type { StaffRole } from "@/lib/api";

/** The roles that work inside the clinic (the owner has its own dashboard). */
export type ClinicStaffRole = Exclude<StaffRole, "owner">;

export interface StaffArea {
  /** Shown on the sign-in screen: "Doctor sign in", "Pharmacy sign in". */
  name: string;
  /** Where this role's screens live; also the installed app's scope. */
  base: string;
  home: string;
  login: string;
  more: string;
}

/**
 * Each clinic role has its own part of the app, with its own sign-in page.
 * Layouts let in only their role and send anyone else to their own home.
 */
export const staffAreas: Record<ClinicStaffRole, StaffArea> = {
  doctor: { name: "Doctor", base: "/admin", home: "/admin/queue", login: "/admin/login", more: "/admin/more" },
  pharmacist: {
    name: "Pharmacy",
    base: "/pharmacy",
    home: "/pharmacy/feed",
    login: "/pharmacy/login",
    more: "/pharmacy/more",
  },
  receptionist: {
    name: "Reception",
    base: "/reception",
    home: "/reception",
    login: "/reception/login",
    more: "/reception/more",
  },
};

/** Where a signed-in account belongs: the owner's dashboard or the role's home. */
export function homeFor(role: StaffRole): string {
  return role === "owner" ? "/owner" : staffAreas[role].home;
}
