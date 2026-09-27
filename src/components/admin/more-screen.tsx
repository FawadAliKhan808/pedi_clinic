"use client";

import {
  BarChart3,
  Bell,
  CalendarRange,
  ChevronRight,
  KeyRound,
  LogOut,
  QrCode,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ChangePasswordSheet } from "@/components/admin/change-password-sheet";
import { useSignOut } from "@/components/layout/sign-out-button";
import type { StaffRole } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { cn } from "@/lib/format";
import { useUnreadNotificationCount } from "@/lib/notifications/unread";

/**
 * Everything that isn't needed all day, so the tab bar stays short: the
 * doctor's notifications, availability, analytics and check-in QR, and the
 * account (change password, sign out) for doctor and pharmacist.
 */
export function MoreScreen({ role }: { role: Exclude<StaffRole, "owner"> }) {
  const [email, setEmail] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const { signOut, busy: signingOut } = useSignOut("/admin/login");

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
        <Section title="Clinic">
          {role === "doctor" && <NotificationsRow />}
          {role === "doctor" && (
            <Row
              href="/admin/availability"
              icon={CalendarRange}
              title="Availability"
              subtitle="Open the sessions parents can book"
            />
          )}
          {role === "doctor" && (
            <Row
              href="/admin/analytics"
              icon={BarChart3}
              title="Analytics"
              subtitle="End of day and trends"
            />
          )}
          <Row
            href="/admin/check-in-qr"
            icon={QrCode}
            title="Check-in QR"
            subtitle="Print the QR parents scan at reception"
          />
        </Section>

        <Section title="Account">
          <Row
            onClick={() => setChangingPassword(true)}
            icon={KeyRound}
            title="Change password"
            subtitle="For signing in to the staff app"
          />
          <Row
            onClick={() => void signOut()}
            icon={LogOut}
            title={signingOut ? "Signing out…" : "Sign out"}
            danger
          />
        </Section>
      </div>

      <ChangePasswordSheet open={changingPassword} onClose={() => setChangingPassword(false)} />
    </div>
  );
}

/** Its own component so only the doctor's screen subscribes to notifications. */
function NotificationsRow() {
  const unread = useUnreadNotificationCount();
  return (
    <Row
      href="/admin/notifications"
      icon={Bell}
      title="Notifications"
      subtitle="New bookings from parents"
      badge={unread}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-foreground-muted">
        {title}
      </h2>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-raised shadow-md">
        {children}
      </div>
    </section>
  );
}

/** One line in a section: a link to a screen, or an action. */
function Row({
  href,
  onClick,
  icon: Icon,
  title,
  subtitle,
  badge,
  danger = false,
}: {
  href?: string;
  onClick?: () => void;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: number;
  danger?: boolean;
}) {
  const body = (
    <>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          danger
            ? "bg-danger/10 text-danger"
            : "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-display font-bold", danger ? "text-danger" : "text-foreground")}>
          {title}
        </span>
        {subtitle && <span className="block text-sm text-foreground-muted">{subtitle}</span>}
      </span>
      {badge ? (
        <span className="flex min-w-6 items-center justify-center rounded-full bg-accent-500 px-1.5 text-xs font-bold leading-6 text-foreground-on-accent">
          {badge > 9 ? "9+" : badge}
          <span className="sr-only"> unread</span>
        </span>
      ) : null}
      {href && <ChevronRight aria-hidden className="size-5 shrink-0 text-foreground-muted" />}
    </>
  );
  const className =
    "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-sunken";
  return href ? (
    <Link href={href} prefetch className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}
