"use client";

import { CalendarDays, FolderClock, House } from "lucide-react";
import type { ReactNode } from "react";
import { NavShell, type NavItem } from "@/components/layout/nav-shell";
import { SignOutButton } from "@/components/layout/sign-out-button";

const parentNav: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/records", label: "Last visits", icon: FolderClock },
];

/** Frame for the signed-in parent screens: bottom tabs on phones, sidebar wider up. */
export function ParentShell({ children }: { children: ReactNode }) {
  return (
    <NavShell
      items={parentNav}
      sidebarFooter={<SignOutButton redirectTo="/" variant="sidebar" />}
    >
      {children}
    </NavShell>
  );
}
