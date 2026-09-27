import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";

/**
 * The grouped list on the More tabs (staff and parents): a small heading and
 * a white card of rows.
 */
export function MenuSection({ title, children }: { title: string; children: ReactNode }) {
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

/** One row: a link to a screen (with a chevron), or an action. */
export function MenuRow({
  href,
  onClick,
  icon: Icon,
  leading,
  title,
  subtitle,
  badge,
  danger = false,
}: {
  href?: string;
  onClick?: () => void;
  icon?: LucideIcon;
  /** Instead of an icon, e.g. a photo. */
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  badge?: number;
  danger?: boolean;
}) {
  const body = (
    <>
      {leading ??
        (Icon && (
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
        ))}
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
