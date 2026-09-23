"use client";

import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  ListOrdered,
  Package,
  Pill,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavShell, type NavItem } from "@/components/layout/nav-shell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import type { StaffRole } from "@/lib/api";

const navByRole: Record<"doctor" | "pharmacist", NavItem[]> = {
  doctor: [
    { href: "/admin/queue", label: "Queue", icon: ListOrdered },
    { href: "/admin/appointments", label: "Appointments", icon: CalendarDays },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/admin/availability", label: "Availability", icon: CalendarRange },
  ],
  pharmacist: [
    { href: "/admin/feed", label: "Feed", icon: Pill },
    { href: "/admin/stock", label: "Stock", icon: Package },
  ],
};

/** Frame for the staff terminal, with each role's own tabs. */
export function StaffShell({ role, children }: { role: StaffRole; children: ReactNode }) {
  return (
    <NavShell
      items={role === "pharmacist" ? navByRole.pharmacist : navByRole.doctor}
      sidebarFooter={<SignOutButton redirectTo="/admin/login" variant="sidebar" />}
    >
      {children}
    </NavShell>
  );
}
