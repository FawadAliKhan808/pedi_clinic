"use client";

import {
  BarChart3,
  Bell,
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
import { useUnreadNotificationCount } from "@/lib/notifications/unread";

/** Frame for the staff terminal, with each role's own tabs. */
export function StaffShell({ role, children }: { role: StaffRole; children: ReactNode }) {
  const signOut = <SignOutButton redirectTo="/admin/login" variant="sidebar" />;

  if (role === "pharmacist") {
    return (
      <NavShell items={pharmacistNav} sidebarFooter={signOut}>
        {children}
      </NavShell>
    );
  }

  return <DoctorShell signOut={signOut}>{children}</DoctorShell>;
}

const pharmacistNav: NavItem[] = [
  { href: "/admin/feed", label: "Feed", icon: Pill },
  { href: "/admin/stock", label: "Stock", icon: Package },
];

/** Only the doctor receives notifications (booking requests), so only they get the inbox. */
function DoctorShell({ signOut, children }: { signOut: ReactNode; children: ReactNode }) {
  const unread = useUnreadNotificationCount();

  const doctorNav: NavItem[] = [
    { href: "/admin/queue", label: "Queue", icon: ListOrdered },
    { href: "/admin/appointments", label: "Appointments", icon: CalendarDays },
    { href: "/admin/notifications", label: "Alerts", icon: Bell, badge: unread },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/admin/availability", label: "Availability", icon: CalendarRange },
  ];

  return (
    <NavShell items={doctorNav} sidebarFooter={signOut}>
      {children}
    </NavShell>
  );
}
