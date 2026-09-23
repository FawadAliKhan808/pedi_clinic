"use client";

import { Bell, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppointmentStatusPill } from "@/components/appointments/appointment-status-pill";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { AppNotification } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { cn, errorMessage } from "@/lib/format";
import { renderNotification } from "@/lib/notifications/templates";
import { announceNotificationsChanged, onNotificationsChanged } from "@/lib/notifications/unread";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return new Date().toDateString() === date.toDateString()
    ? time
    : `${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

/**
 * The doctor's notification center. Newest first. Anything unread when it
 * arrives on screen stays highlighted for this visit (so the doctor can see
 * what's new) while being marked read on the server — next time it's muted.
 */
export default function NotificationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const api = getBrowserApi().notifications;
    return api
      .listMine()
      .then((list) => {
        setItems(list);
        const unreadIds = list.filter((item) => !item.readAt).map((item) => item.id);
        if (unreadIds.length > 0) {
          setFresh((current) => new Set([...current, ...unreadIds]));
          return api.markRead(unreadIds).then(announceNotificationsChanged);
        }
      })
      .catch((caught) => toast(errorMessage(caught), "error"));
  }, [toast]);

  useEffect(() => {
    void refresh();
    return onNotificationsChanged(() => void refresh());
  }, [refresh]);

  async function decide(item: AppNotification, approve: boolean) {
    if (!item.appointmentId) return;
    setBusyId(item.id);
    try {
      const api = getBrowserApi();
      await (approve
        ? api.appointments.approve(item.appointmentId)
        : api.appointments.reject(item.appointmentId));
      toast(approve ? "Approved — parent notified" : "Rejected — parent notified", "success");
      void api.notifications.dispatchPending();
      await refresh();
    } catch (caught) {
      toast(errorMessage(caught), "error");
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: AppNotification) {
    setItems((current) => current?.filter((existing) => existing.id !== item.id) ?? null);
    try {
      await getBrowserApi().notifications.delete(item.id);
      announceNotificationsChanged();
    } catch (caught) {
      toast(errorMessage(caught), "error");
      await refresh();
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
        <p className="text-sm text-foreground-muted">
          Booking requests from parents, newest first.
        </p>
      </header>

      <ul className="flex w-full max-w-3xl flex-col gap-3 px-5 py-3">
        {items === null ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Bell className="size-8" />}
            title="No notifications"
            description="When a parent requests an appointment, it shows up here for you to approve."
          />
        ) : (
          items.map((item) => {
            const rendered = renderNotification(item.type, item.payload);
            const isNew = fresh.has(item.id);
            const isOpenRequest =
              item.type === "booking_request" && item.appointmentStatus === "pending";

            return (
              <li
                key={item.id}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-4 transition-colors",
                  isNew
                    ? "border-accent-300 border-l-4 border-l-accent-500 bg-accent-50 shadow-sm dark:border-accent-800 dark:bg-accent-900/20"
                    : "border-border bg-surface-raised opacity-70"
                )}
              >
                <div className="flex items-start gap-3">
                  {isNew && (
                    <span aria-label="New" className="mt-2 size-2 shrink-0 rounded-full bg-accent-500" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p
                      className={cn(
                        "font-semibold",
                        isNew ? "text-foreground" : "text-foreground-muted"
                      )}
                    >
                      {rendered.title}
                    </p>
                    <p className="text-sm text-foreground-muted">{rendered.body}</p>
                    <p className="text-xs text-foreground-muted">{formatWhen(item.createdAt)}</p>
                  </div>
                  <button
                    aria-label="Delete notification"
                    onClick={() => void remove(item)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {item.type === "booking_request" &&
                  (isOpenRequest ? (
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        loading={busyId === item.id}
                        onClick={() => void decide(item, true)}
                      >
                        Approve
                      </Button>
                      <ConfirmButton
                        className="flex-1"
                        label="Reject"
                        confirmLabel="Tap again to reject"
                        onConfirm={() => decide(item, false)}
                      />
                    </div>
                  ) : (
                    item.appointmentStatus && (
                      <div className="flex items-center gap-2 text-sm text-foreground-muted">
                        <AppointmentStatusPill status={item.appointmentStatus} />
                        {item.appointmentStatus === "pending" ? null : "Already handled"}
                      </div>
                    )
                  ))}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
