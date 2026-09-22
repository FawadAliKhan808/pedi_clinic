"use client";

import { FolderClock, House } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

const tabs = [
  { href: "/", label: "Home", icon: House },
  { href: "/records", label: "Records", icon: FolderClock },
];

export function ParentTabs() {
  const pathname = usePathname();

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
