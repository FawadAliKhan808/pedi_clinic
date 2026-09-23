"use client";

import { ChevronRight, FolderClock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ParentShell } from "@/components/parent/parent-shell";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { ChildHistorySheet } from "@/components/visits/child-history-sheet";
import type { Child } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatAge } from "@/lib/format";

export default function RecordsPage() {
  const router = useRouter();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [openChild, setOpenChild] = useState<Child | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadChildren()
      .then((result) => {
        if (cancelled) return;
        if (result === null) router.replace("/");
        else setChildren(result);
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(errorMessage(caught));
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <ParentShell>
      <header className="px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Records</h1>
        <p className="text-sm text-foreground-muted">
          Past visits and prescriptions for each child.
        </p>
      </header>

      <div className="grid gap-3 px-5 py-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
        {children === null && loadError ? (
          <div className="col-span-full">
            <ErrorState message={loadError} onRetry={() => window.location.reload()} />
          </div>
        ) : children === null ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : children.length === 0 ? (
          <EmptyState
            icon={<FolderClock className="size-8" />}
            title="No records yet"
            description="Visits appear here once your child has been seen."
          />
        ) : (
          children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => setOpenChild(child)}
              className="text-left"
            >
              <Card className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate font-semibold text-foreground">{child.name}</p>
                  <p className="text-sm text-foreground-muted">{formatAge(child.dob)}</p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-foreground-muted" />
              </Card>
            </button>
          ))
        )}
      </div>

      {openChild && (
        <ChildHistorySheet
          open
          childId={openChild.id}
          childName={openChild.name}
          childDob={openChild.dob}
          summaryLinks
          onClose={() => setOpenChild(null)}
        />
      )}
    </ParentShell>
  );
}

/** Null when there's no session, so the caller can send them home. */
async function loadChildren(): Promise<Child[] | null> {
  const api = getBrowserApi();
  const userId = await api.auth.getCurrentUserId();
  if (!userId) return null;
  return api.parents.listMyChildren();
}
