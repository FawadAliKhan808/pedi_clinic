"use client";

import { CalendarDays, FolderClock, House, Menu } from "lucide-react";
import type { ReactNode } from "react";
import { NavShell, type NavItem } from "@/components/layout/nav-shell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import {
  NotificationPermissionPrompt,
  TopNotificationBanner,
} from "@/components/parent/notification-permission-prompt";
import { useCompletedVisitRedirect } from "@/lib/realtime/use-completed-visit-redirect";

const parentNav: NavItem[] = [
  { href: "/", label: "Home", icon: House, alsoActiveOn: ["/children/"] },
  { href: "/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/records", label: "Last visits", icon: FolderClock },
  // Same idea as the staff app's More: the doctor's profile and the account.
  { href: "/more", label: "More", icon: Menu, alsoActiveOn: ["/doctor"] },
];

/**
 * Frame for the signed-in parent screens: bottom tabs on phones, sidebar
 * wider up. Also watches for a consultation finishing (opens its summary) and
 * keeps asking to turn notifications on until they are.
 */
export function ParentShell({ children }: { children: ReactNode }) {
  useCompletedVisitRedirect();
  return (
    <NavShell
      items={parentNav}
      sidebarFooter={<SignOutButton redirectTo="/" variant="sidebar" />}
    >
      <TopNotificationBanner />
      {children}
      {/* The modal is fixed-position, so where it sits in the tree doesn't matter. */}
      <NotificationPermissionPrompt />
    </NavShell>
  );
}
