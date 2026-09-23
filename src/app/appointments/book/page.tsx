"use client";

import { ArrowLeft, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SessionPicker } from "@/components/appointments/session-picker";
import { StickyActionBar } from "@/components/layout/nav-shell";
import { Button } from "@/components/ui/button";
import { SelectableCard } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { AvailabilitySession, Child } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatAge, formatDayShort, formatTimeRange } from "@/lib/format";

interface BookingData {
  children: Child[];
  sessions: AvailabilitySession[];
}

/** Null when there's no session, so the caller can send them home. */
async function loadBookingData(): Promise<BookingData | null> {
  const api = getBrowserApi();
  if (!(await api.auth.getCurrentUserId())) return null;

  const window = await api.appointments.getBookingWindow();
  const [children, sessions] = await Promise.all([
    api.parents.listMyChildren(),
    api.appointments.listSessions(window.clinicId, window.fromDate, window.toDate),
  ]);
  return { children, sessions };
}

/** Child → date → session → confirm, all on one scrolling screen. */
export default function BookAppointmentPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<BookingData | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [session, setSession] = useState<AvailabilitySession | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadBookingData()
      .then((result) => {
        if (cancelled) return;
        if (result === null) {
          router.replace("/");
          return;
        }
        setData(result);
        if (result.children.length === 1) setChildId(result.children[0].id);
      })
      .catch((caught) => toast(errorMessage(caught), "error"));
    return () => {
      cancelled = true;
    };
  }, [router, toast]);

  async function book() {
    if (!childId || !session) return;
    setBusy(true);
    try {
      const api = getBrowserApi();
      await api.appointments.book({ sessionId: session.id, childId });
      void api.notifications.dispatchPending();
      toast(
        `Request sent for ${formatDayShort(session.date)}, ${formatTimeRange(session.startTime, session.endTime)} — the doctor will confirm it`,
        "success"
      );
      router.replace("/appointments");
    } catch (caught) {
      toast(errorMessage(caught), "error");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <header className="flex items-center gap-2 px-3 pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        <button
          aria-label="Back"
          onClick={() => router.back()}
          className="flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Book an appointment</h1>
      </header>

      {data === null ? (
        <div className="flex flex-col gap-3 px-5 py-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : data.children.length === 0 ? (
        <EmptyState
          title="Add your child first"
          description="Add your child's name and date of birth on the Home screen, then book."
        />
      ) : (
        <>
          <section className="grid gap-3 px-5 py-3 md:grid-cols-2">
            <h2 className="col-span-full text-sm font-semibold uppercase tracking-wide text-foreground-muted">
              Who is the appointment for?
            </h2>
            {data.children.map((child) => (
              <SelectableCard
                key={child.id}
                selected={childId === child.id}
                onSelect={() => setChildId(child.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{child.name}</p>
                    <p className="text-sm text-foreground-muted">{formatAge(child.dob)}</p>
                  </div>
                  {childId === child.id && <Check className="size-5 text-primary-600" />}
                </div>
              </SelectableCard>
            ))}
          </section>

          <section className="flex flex-col gap-3 px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
              Pick a time
            </h2>
            <SessionPicker
              sessions={data.sessions}
              selectedSessionId={session?.id ?? null}
              onSelect={setSession}
            />
          </section>
        </>
      )}

      <StickyActionBar>
        <Button
          fullWidth
          variant="accent"
          loading={busy}
          disabled={!childId || !session}
          onClick={() => void book()}
        >
          Request appointment
        </Button>
      </StickyActionBar>
    </div>
  );
}
