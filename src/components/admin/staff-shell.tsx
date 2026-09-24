"use client";

import {
  BarChart3,
  Bell,
  CalendarDays,
  CalendarRange,
  History,
  ListOrdered,
  Package,
  Pill,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavShell, type NavItem } from "@/components/layout/nav-shell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import type { StaffRole } from "@/lib/api";
import { useUnreadNotificationCount } from "@/lib/notifications/unread";
import { useActiveQueueCount } from "@/lib/realtime/use-active-queue";

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
  const inQueue = useActiveQueueCount();

  const doctorNav: NavItem[] = [
    {
      href: "/admin/queue",
      label: "Queue",
      icon: ListOrdered,
      // Live: lights up the moment anyone is waiting, from any screen.
      dot: inQueue > 0 && `${inQueue} in the queue`,
    },
    { href: "/admin/appointments", label: "Appointments", icon: CalendarDays },
    { href: "/admin/history", label: "History", icon: History },
    { href: "/admin/notifications", label: "Notification", icon: Bell, badge: unread },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/admin/availability", label: "Availability", icon: CalendarRange },
  ];

  return (
    <NavShell items={doctorNav} sidebarFooter={signOut}>
      {children}
    </NavShell>
  );
}
