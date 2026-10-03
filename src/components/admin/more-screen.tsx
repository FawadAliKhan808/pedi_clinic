"use client";

import { BarChart3, Bell, CalendarRange, KeyRound, LogOut, QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { ChangePasswordSheet } from "@/components/admin/change-password-sheet";
import { useSignOut } from "@/components/layout/sign-out-button";
import { MenuRow, MenuSection } from "@/components/ui/menu-list";
import { staffAreas, type ClinicStaffRole } from "@/lib/auth/staff-areas";
import { getBrowserApi } from "@/lib/api/browser";
import { useUnreadNotificationCount } from "@/lib/notifications/unread";

/**
 * Everything that isn't needed all day, so the tab bar stays short: the
 * doctor's notifications, availability, analytics and check-in QR, and the
 * account (change password, sign out) for every clinic role.
 */
export function MoreScreen({ role }: { role: ClinicStaffRole }) {
  const [email, setEmail] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const { signOut, busy: signingOut } = useSignOut(staffAreas[role].login);

  useEffect(() => {
    void getBrowserApi()
      .auth.getCurrentEmail()
      .then(setEmail)
      .catch(() => undefined);
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">More</h1>
        {email && <p className="truncate text-sm text-foreground-muted">Signed in as {email}</p>}
      </header>

      <div className="flex w-full max-w-2xl flex-col gap-6 px-5 py-3 pb-8">
        <MenuSection title="Clinic">
          {role === "doctor" && <NotificationsRow />}
          {role === "doctor" && (
            <MenuRow
              href="/admin/availability"
              icon={CalendarRange}
              title="Availability"
              subtitle="Open the sessions parents can book"
            />
          )}
          {role === "doctor" && (
            <MenuRow
              href="/admin/analytics"
              icon={BarChart3}
              title="Analytics"
              subtitle="End of day and trends"
            />
          )}
          <MenuRow
            href="/admin/check-in-qr"
            icon={QrCode}
            title="Check-in QR"
            subtitle="Print the QR parents scan at reception"
          />
        </MenuSection>

        <MenuSection title="Account">
          <MenuRow
            onClick={() => setChangingPassword(true)}
            icon={KeyRound}
            title="Change password"
            subtitle="For signing in to the staff app"
          />
          <MenuRow
            onClick={() => void signOut()}
            icon={LogOut}
            title={signingOut ? "Signing out…" : "Sign out"}
            danger
          />
        </MenuSection>
      </div>

      <ChangePasswordSheet open={changingPassword} onClose={() => setChangingPassword(false)} />
    </div>
  );
}

/** Its own component so only the doctor's screen subscribes to notifications. */
function NotificationsRow() {
  const unread = useUnreadNotificationCount();
  return (
    <MenuRow
      href="/admin/notifications"
      icon={Bell}
      title="Notifications"
      subtitle="New bookings from parents"
      badge={unread}
    />
  );
}

