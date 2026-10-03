"use client";

import { CalendarDays, History, ListOrdered, Menu, Package, Pill } from "lucide-react";
import type { ReactNode } from "react";
import { NavShell, type NavItem } from "@/components/layout/nav-shell";
import { InstallPrompt } from "@/components/parent/install-and-notifications";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { staffAreas, type ClinicStaffRole } from "@/lib/auth/staff-areas";
import { useUnreadNotificationCount } from "@/lib/notifications/unread";
import { useActiveQueueCount } from "@/lib/realtime/use-active-queue";

/** Frame for each staff role's terminal, with that role's own tabs. */
export function StaffShell({ role, children: page }: { role: ClinicStaffRole; children: ReactNode }) {
  // Back to the sign-in page this role uses.
  const signOut = <SignOutButton redirectTo={staffAreas[role].login} variant="sidebar" />;
  // In a browser tab, every staff screen asks to install the staff app
  // (popup once per visit, then this card). The installed app shows neither.
  const children = (
    <>
      <div className="px-5 pt-[calc(1rem+env(safe-area-inset-top))] empty:hidden">
        <InstallPrompt audience={role} />
      </div>
      {page}
    </>
  );

  if (role === "pharmacist") {
    return (
      <NavShell items={pharmacistNav} sidebarFooter={signOut}>
        {children}
      </NavShell>
    );
  }

  if (role === "receptionist") {
    return <ReceptionShell signOut={signOut}>{children}</ReceptionShell>;
  }

  return <DoctorShell signOut={signOut}>{children}</DoctorShell>;
}

const pharmacistNav: NavItem[] = [
  { href: "/pharmacy/feed", label: "Feed", icon: Pill },
  { href: "/pharmacy/stock", label: "Stock", icon: Package },
  { href: staffAreas.pharmacist.more, label: "More", icon: Menu },
];

/** Reception: today's queue (with Add walk-in) and the account. */
function ReceptionShell({ signOut, children }: { signOut: ReactNode; children: ReactNode }) {
  const inQueue = useActiveQueueCount();
  const nav: NavItem[] = [
    {
      href: staffAreas.receptionist.home,
      label: "Queue",
      icon: ListOrdered,
      dot: inQueue > 0 && `${inQueue} in the queue`,
    },
    { href: staffAreas.receptionist.more, label: "More", icon: Menu },
  ];
  return (
    <NavShell items={nav} sidebarFooter={signOut}>
      {children}
    </NavShell>
  );
}

/** Screens reached from the doctor's More tab; More stays highlighted on them. */
export const DOCTOR_MORE_SCREENS = [
  "/admin/notifications",
  "/admin/availability",
  "/admin/analytics",
];

/**
 * The doctor's tabs: only what's used all day. Everything else (notifications,
 * availability, analytics, the check-in QR, password, sign out) is under More.
 * Only the doctor receives notifications (booking requests), so only they
 * get the inbox — its unread count shows on More.
 */
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
    {
      href: "/admin/more",
      label: "More",
      icon: Menu,
      badge: unread,
      alsoActiveOn: DOCTOR_MORE_SCREENS,
    },
  ];

  return (
    <NavShell items={doctorNav} sidebarFooter={signOut}>
      {children}
    </NavShell>
  );
}
