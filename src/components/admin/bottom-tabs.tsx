"use client";

import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  ListOrdered,
  Package,
  Pill,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StaffRole } from "@/lib/api";
import { cn } from "@/lib/format";

const tabsByRole = {
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
} as const;

export function BottomTabs({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  const tabs = role === "pharmacist" ? tabsByRole.pharmacist : tabsByRole.doctor;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-[4.5rem] flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold",
              active ? "text-primary-600" : "text-foreground-muted"
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
