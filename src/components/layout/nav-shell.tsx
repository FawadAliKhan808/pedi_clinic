"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { brand } from "@/brand";
import { cn } from "@/lib/format";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Unread count shown on the item; hidden when 0. */
  badge?: number;
  /** A small orange dot (e.g. "patients waiting"); its text is read to screen readers. */
  dot?: string | false;
}

/**
 * The app frame for signed-in screens, mobile-first:
 *   - phones: bottom tab bar;
 *   - tablets: a narrow icon rail on the left, so portrait tablets keep room
 *     for two columns of cards;
 *   - laptops: a full sidebar with the app name.
 * The content area is a size container: card grids pick their column count
 * from the space they actually have (`@2xl:` / `@4xl:`), not the screen width.
 */
export function NavShell({
  items,
  children,
  sidebarFooter,
}: {
  items: NavItem[];
  children: ReactNode;
  /** Shown at the bottom of the rail/sidebar on tablets and laptops — e.g. sign out. */
  sidebarFooter?: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-24 lg:pl-60">
      <main className="@container mx-auto flex w-full max-w-6xl flex-1 flex-col md:px-4 lg:px-8">
        {children}
      </main>

      <nav
        aria-label="Main"
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]",
          "md:inset-y-0 md:left-0 md:right-auto md:w-24 md:flex-col md:gap-1 md:border-r md:border-t-0",
          "md:px-2 md:pb-4 md:pt-[calc(1.5rem+env(safe-area-inset-top))] lg:w-60 lg:px-3"
        )}
      >
        <p className="hidden px-3 pb-4 text-lg font-bold text-foreground lg:block">
          {brand.name}
        </p>

        {items.map(({ href, label, icon: Icon, badge, dot }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              // Preload each tab fully (it's a small shell; the screen fetches
              // its own data), so switching tabs is instant — no server wait
              // and no loading screen holding the data back.
              prefetch
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[4.5rem] flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold",
                "md:min-h-16 md:flex-none md:rounded-lg md:text-[11px]",
                "lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm",
                active
                  ? "text-primary-600 md:bg-primary-50 md:dark:bg-primary-900/30"
                  : "text-foreground-muted md:hover:bg-surface-sunken"
              )}
            >
              <span className="relative">
                <Icon className="size-5" />
                {badge ? (
                  <span className="absolute -right-2.5 -top-2 flex min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold leading-5 text-foreground-on-accent">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : dot ? (
                  <>
                    <span
                      aria-hidden
                      className="absolute -right-1 -top-1 size-2.5 rounded-full bg-accent-500 ring-2 ring-surface-raised"
                    />
                    <span className="sr-only">, {dot}</span>
                  </>
                ) : null}
              </span>
              {label}
            </Link>
          );
        })}

        {sidebarFooter && <div className="hidden md:mt-auto md:block">{sidebarFooter}</div>}
      </nav>
    </div>
  );
}

/**
 * The bottom dock: the page's main action (and anything that belongs with it,
 * stacked above), anchored to the bottom of the screen on every size — just
 * above the tab bar on phones, at the very bottom beside the rail/sidebar on
 * tablets and laptops.
 *
 * It's the last child of a full-height column: `mt-auto` pushes it down when
 * the page is short, and `sticky` keeps it pinned while a long page scrolls
 * under it. Children stack top to bottom; one that renders nothing (e.g. a
 * hidden banner) leaves no gap, so the rest simply close up.
 */
export function StickyActionBar({
  children,
  aboveNav = false,
}: {
  children: ReactNode;
  /** The page has the bottom tab bar (phones): sit just above it. */
  aboveNav?: boolean;
}) {
  return (
    <div
      className={cn(
        "sticky z-30 mt-auto border-t border-border bg-surface/95 px-5 pt-3 backdrop-blur",
        aboveNav
          ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] pb-3 md:bottom-0 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          : "bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      )}
    >
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
