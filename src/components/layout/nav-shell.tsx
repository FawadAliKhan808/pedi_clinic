"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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
          Pedi Clinic
        </p>

        {items.map(({ href, label, icon: Icon, badge, dot }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
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
 * The page's main action. On phones it's pinned to the bottom (above the tab
 * bar when there is one) so it's always within thumb reach; on wider screens
 * it simply sits in the page after the content.
 */
export function StickyActionBar({
  children,
  aboveNav = false,
  tall = false,
}: {
  children: ReactNode;
  aboveNav?: boolean;
  /** A second, small line above the main button (e.g. a text link). */
  tall?: boolean;
}) {
  return (
    <>
      {/* Keeps the last of the content clear of the pinned bar on phones. */}
      <div aria-hidden className={cn("shrink-0 md:hidden", tall ? "h-28" : "h-20")} />
      <div
        className={cn(
          "fixed inset-x-0 z-30 border-t border-border bg-surface px-5 py-3",
          aboveNav
            ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
            : "bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
          "md:static md:z-auto md:border-0 md:bg-transparent md:px-5 md:pb-8 md:pt-2"
        )}
      >
        <div className="md:max-w-xs">{children}</div>
      </div>
    </>
  );
}
