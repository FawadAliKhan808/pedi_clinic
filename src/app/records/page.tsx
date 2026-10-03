"use client";

import { CalendarClock, ChevronRight, FolderClock, Stethoscope, Syringe } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ParentShell } from "@/components/parent/parent-shell";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { PrescriptionThumbs } from "@/components/visits/prescription-photos";
import type { Child, ChildVisitHistoryEntry, VisitReason } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  cn,
  errorMessage,
  formatCurrency,
  formatDate,
  visitReasonLabels,
} from "@/lib/format";
import { lastShown, useRememberShown } from "@/lib/last-shown";

interface PastVisit extends ChildVisitHistoryEntry {
  child: Child;
}

/** Every finished visit for every child, newest first. Null when signed out. */
async function loadPastVisits(): Promise<{ children: Child[]; visits: PastVisit[] } | null> {
  const api = getBrowserApi();
  if (!(await api.auth.getCurrentUserId())) return null;

  const children = await api.parents.listMyChildren();
  const histories = await Promise.all(
    children.map((child) =>
      api.visits.getChildHistory(child.id).then((entries) =>
        entries
          .filter((entry) => entry.status === "completed")
          .map((entry) => ({ ...entry, child }))
      )
    )
  );
  const visits = histories
    .flat()
    .sort((a, b) =>
      (b.completedAt ?? b.visitDate).localeCompare(a.completedAt ?? a.visitDate)
    );
  return { children, visits };
}

const reasonIcons: Record<VisitReason, typeof Syringe> = {
  vaccination: Syringe,
  general_checkup: Stethoscope,
};

export default function LastVisitsPage() {
  const router = useRouter();
  const [data, setData] = useState<{ children: Child[]; visits: PastVisit[] } | null>(
    () => lastShown<{ children: Child[]; visits: PastVisit[] }>("parent-records") ?? null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  useRememberShown("parent-records", data);
  const [childFilter, setChildFilter] = useState<string | "all">("all");
  const [reasonFilter, setReasonFilter] = useState<VisitReason | "all">("all");

  useEffect(() => {
    let cancelled = false;
    loadPastVisits()
      .then((result) => {
        if (cancelled) return;
        if (result === null) router.replace("/");
        else setData(result);
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const shown =
    data?.visits.filter(
      (visit) =>
        (childFilter === "all" || visit.child.id === childFilter) &&
        (reasonFilter === "all" || visit.reason === reasonFilter)
    ) ?? [];
  const filtered = childFilter !== "all" || reasonFilter !== "all";

  return (
    <ParentShell>
      <header className="px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Last visits</h1>
        <p className="text-sm text-foreground-muted">
          Every finished visit, with the doctor&apos;s notes and prescriptions.
        </p>
      </header>

      {data === null && loadError ? (
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      ) : data === null ? (
        <div className="flex flex-col gap-3 px-5 py-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : data.visits.length === 0 ? (
        <EmptyState
          icon={<FolderClock className="size-8" />}
          title="No visits yet"
          description="Visits appear here once your child has been seen."
        />
      ) : (
        <>
          {/* Filters: one row each, scrolling sideways on a narrow phone. */}
          <div className="flex flex-col gap-2 px-5 py-2">
            {data.children.length > 1 && (
              <FilterRow label="Child">
                <FilterChip active={childFilter === "all"} onClick={() => setChildFilter("all")}>
                  All children
                </FilterChip>
                {data.children.map((child) => (
                  <FilterChip
                    key={child.id}
                    active={childFilter === child.id}
                    onClick={() => setChildFilter(child.id)}
                  >
                    {child.name}
                  </FilterChip>
                ))}
              </FilterRow>
            )}
            <FilterRow label="Reason">
              <FilterChip active={reasonFilter === "all"} onClick={() => setReasonFilter("all")}>
                All reasons
              </FilterChip>
              {(Object.keys(visitReasonLabels) as VisitReason[]).map((reason) => (
                <FilterChip
                  key={reason}
                  active={reasonFilter === reason}
                  onClick={() => setReasonFilter(reason)}
                >
                  {visitReasonLabels[reason]}
                </FilterChip>
              ))}
            </FilterRow>
            <p className="text-sm text-foreground-muted" aria-live="polite">
              {shown.length} {shown.length === 1 ? "visit" : "visits"}
              {filtered ? " match" : ""}
            </p>
          </div>

          {shown.length === 0 ? (
            <EmptyState
              title="No visits match"
              description="Try another child or reason."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setChildFilter("all");
                    setReasonFilter("all");
                  }}
                  className="min-h-12 rounded-lg px-4 font-semibold text-primary-600"
                >
                  Clear filters
                </button>
              }
            />
          ) : (
            <ul className="grid gap-3 px-5 py-2 pb-6 @2xl:grid-cols-2 @4xl:grid-cols-3">
              {shown.map((visit) => (
                <li key={visit.visitId}>
                  <VisitCard visit={visit} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </ParentShell>
  );
}

function VisitCard({ visit }: { visit: PastVisit }) {
  const ReasonIcon = reasonIcons[visit.reason];
  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface-raised p-4 shadow-sm">
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-800 dark:bg-primary-900/40 dark:text-primary-200"
        >
          {visit.child.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{visit.child.name}</p>
          <p className="text-sm text-foreground-muted">{formatDate(visit.visitDate)}</p>
        </div>
        {visit.feeTotal !== null && (
          <span className="shrink-0 font-semibold tabular-nums text-foreground">
            {formatCurrency(visit.feeTotal)}
          </span>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1 text-sm font-medium text-foreground">
          <ReasonIcon aria-hidden className="size-4 text-primary-600" />
          {visitReasonLabels[visit.reason]}
        </span>
        {visit.followUpDate && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-3 py-1 text-sm font-medium text-foreground dark:bg-accent-900/30">
            <CalendarClock aria-hidden className="size-4 text-accent-600" />
            Follow-up {formatDate(visit.followUpDate)}
          </span>
        )}
      </div>

      {visit.storageKeys.length > 0 && <PrescriptionThumbs storageKeys={visit.storageKeys} />}

      <Link
        href={`/visits/${visit.visitId}`}
        className="mt-auto flex min-h-12 items-center justify-between rounded-xl border border-border px-4 text-sm font-semibold text-primary-700 hover:bg-surface-sunken dark:text-primary-300"
      >
        View visit summary
        <ChevronRight aria-hidden className="size-4" />
      </Link>
    </article>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={`Filter by ${label.toLowerCase()}`} className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors",
        active
          ? "border-primary-600 bg-primary-600 text-foreground-on-primary"
          : "border-border bg-surface text-foreground hover:bg-surface-sunken"
      )}
    >
      {children}
    </button>
  );
}
