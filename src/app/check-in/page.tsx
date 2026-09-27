"use client";

import { ArrowLeft, CalendarCheck, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StickyActionBar } from "@/components/layout/nav-shell";
import { extractCheckInCode, QrScanner } from "@/components/parent/qr-scanner";
import { ChildPicker, ReasonPicker } from "@/components/parent/visit-pickers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { Child, ParentAppointment, UUID, VisitReason } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  errorMessage,
  formatDayShort,
  formatTimeRange,
  visitReasonLabels,
} from "@/lib/format";
import {
  NOTIFY_AFTER_TOKEN,
  sessionFlag,
  SHOW_INSTALL_AFTER_TOKEN,
} from "@/lib/pwa/environment";

/**
 * A scanned code, kept for a short while: scanning with the phone's camera
 * app while signed out lands on sign-in first, and the code should still be
 * there afterwards. The server decides whether it's still the clinic's code.
 */
const SCANNED_CODE_KEY = "pedi.checkInCode";
/** Long enough to sign in and pick a child; a later check-in means scanning again. */
const SCANNED_CODE_TTL_MS = 15 * 60 * 1000;

function rememberCode(code: string | null) {
  try {
    if (code) sessionStorage.setItem(SCANNED_CODE_KEY, JSON.stringify({ code, at: Date.now() }));
    else sessionStorage.removeItem(SCANNED_CODE_KEY);
  } catch {
    // Not remembered; they'll scan again.
  }
}

/** A code from the link the phone's camera app opened, or one scanned minutes ago. */
function initialCode(): string | null {
  const fromLink = new URLSearchParams(globalThis.location.search).get("code");
  if (fromLink) {
    const code = extractCheckInCode(`${globalThis.location.origin}/check-in?code=${fromLink}`);
    // Keep it out of the address bar, so the link isn't reused from history.
    globalThis.history.replaceState(null, "", "/check-in");
    rememberCode(code);
    return code;
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(SCANNED_CODE_KEY) ?? "null") as
      | { code: string; at: number }
      | null;
    if (saved && Date.now() - saved.at < SCANNED_CODE_TTL_MS) return saved.code;
  } catch {
    // Nothing usable saved.
  }
  return null;
}

interface CheckInData {
  children: Child[];
  today: string;
  /** Confirmed bookings from tomorrow on — today's are linked automatically. */
  upcoming: ParentAppointment[];
  /** Children already waiting, called or with the doctor — they can't check in again yet. */
  inQueue: Set<UUID>;
}

export default function CheckInPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<CheckInData | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [reason, setReason] = useState<VisitReason | null>(null);
  // Children whose upcoming booking the parent said isn't why they're here.
  const [declined, setDeclined] = useState<Set<UUID>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Check-in only happens inside the clinic: nothing below the scanner
  // appears until the QR code at reception has been scanned.
  const [checkInCode, setCheckInCode] = useState<string | null>(null);
  const [codeChecked, setCodeChecked] = useState(false);

  useEffect(() => {
    // Browser-only (the address bar and sessionStorage), so read after mount.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setCheckInCode(initialCode());
      setCodeChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function scanned(code: string) {
    rememberCode(code);
    setCheckInCode(code);
  }

  useEffect(() => {
    void (async () => {
      const api = getBrowserApi();
      const userId = await api.auth.getCurrentUserId();
      if (!userId) {
        router.replace("/");
        return;
      }
      const [children, window, appointments, queue] = await Promise.all([
        api.parents.listMyChildren(),
        api.appointments.getBookingWindow(),
        api.appointments.listMyAppointments(),
        api.queue.getParentQueueView(),
      ]);
      const inQueue = new Set(
        queue
          .filter((entry) => ["waiting", "called", "in_consultation"].includes(entry.status))
          .map((entry) => entry.childId)
      );
      setData({
        children,
        today: window.today,
        upcoming: appointments.filter(
          (item) => item.status === "booked" && item.date > window.today
        ),
        inQueue,
      });
      // Pre-select the child whose "Check in" button was tapped (or the only one).
      const requested = new URLSearchParams(globalThis.location.search).get("child");
      const available = children.filter((child) => !inQueue.has(child.id));
      if (requested && available.some((child) => child.id === requested)) setChildId(requested);
      else if (available.length === 1) setChildId(available[0].id);
    })().catch((caught) => setLoadError(errorMessage(caught)));
  }, [router]);

  // The nearest upcoming booking for the chosen child, unless they said no.
  const upcoming =
    childId && !declined.has(childId)
      ? data?.upcoming
          .filter((item) => item.childId === childId)
          .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0] ?? null
      : null;

  async function checkIn(input: {
    childId: UUID;
    visitReason: VisitReason;
    appointmentId?: UUID;
  }) {
    if (!checkInCode) return;
    setBusy(true);
    try {
      const api = getBrowserApi();
      await api.queue.checkIn({ ...input, checkInCode });
      rememberCode(null);
      // A new token can put this child 3rd in line straight away.
      void api.notifications.dispatchPending();
      // The brief asks for the install popup again right after a token.
      sessionFlag.set(SHOW_INSTALL_AFTER_TOKEN, true);
      // High-intent moment: the queue screen asks to turn notifications on.
      sessionFlag.set(NOTIFY_AFTER_TOKEN, true);
      router.replace("/queue");
    } catch (caught) {
      toast(errorMessage(caught), "error");
      setBusy(false);
      // Not the clinic's current code (e.g. it was replaced): back to the scanner.
      if ((caught as { code?: string }).code === "CHECKIN_CODE_INVALID") {
        rememberCode(null);
        setCheckInCode(null);
      }
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
        <h1 className="text-xl font-bold text-foreground">Check in</h1>
      </header>

      {!codeChecked ? null : !checkInCode ? (
        <section className="flex flex-col gap-4 px-5 py-3">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Scan the QR code at reception
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              You can only check in at the clinic. The QR code is at the reception
              desk.
            </p>
          </div>
          <QrScanner onCode={scanned} />
        </section>
      ) : data === null && loadError ? (
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      ) : data === null ? (
        <div className="flex flex-col gap-3 px-5 py-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <>
          <p
            role="status"
            className="mx-5 mt-1 flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-sm font-semibold text-foreground"
          >
            <CircleCheck aria-hidden className="size-5 shrink-0 text-success" />
            QR code scanned — you&apos;re at the clinic.
          </p>
          <ChildPicker
            title="Who is visiting?"
            options={data.children}
            selectedId={childId}
            onSelect={setChildId}
            unavailable={Object.fromEntries(
              [...data.inQueue].map((id) => [id, "Currently in queue"])
            )}
          />

          {upcoming ? (
            <section className="px-5 py-3" aria-live="polite">
              <Card className="flex flex-col gap-4 border-primary-300 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20">
                <div className="flex items-start gap-3">
                  <CalendarCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-primary-700 dark:text-primary-300" />
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold text-foreground">
                      Are you coming for the same reason you booked your upcoming appointment?
                    </p>
                    <p className="text-sm text-foreground-muted">
                      {upcoming.childName} is booked for{" "}
                      <strong className="text-foreground">
                        {visitReasonLabels[upcoming.visitReason]}
                      </strong>{" "}
                      on {formatDayShort(upcoming.date)},{" "}
                      {formatTimeRange(upcoming.startTime, upcoming.endTime)}. If yes, we&apos;ll
                      use that booking for today&apos;s token.
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    loading={busy}
                    onClick={() =>
                      void checkIn({
                        childId: upcoming.childId,
                        visitReason: upcoming.visitReason,
                        appointmentId: upcoming.appointmentId,
                      })
                    }
                  >
                    Yes, same reason
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      setDeclined((current) => new Set(current).add(upcoming.childId))
                    }
                  >
                    No, something else
                  </Button>
                </div>
              </Card>
            </section>
          ) : (
            <ReasonPicker selected={reason} onSelect={setReason} />
          )}
        </>
      )}

      {checkInCode && !upcoming && (
        <StickyActionBar>
          <Button
            fullWidth
            variant="accent"
            loading={busy}
            disabled={!childId || !reason}
            onClick={() => childId && reason && void checkIn({ childId, visitReason: reason })}
          >
            Get token
          </Button>
        </StickyActionBar>
      )}
    </div>
  );
}
