"use client";

import { Bell, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppointmentStatusPill } from "@/components/appointments/appointment-status-pill";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

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
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [toast]);

  useEffect(() => {
    void refresh();
    return onNotificationsChanged(() => void refresh());
  }, [refresh]);

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
        <h1 className="text-2xl font-bold text-foreground">Notification</h1>
        <p className="text-sm text-foreground-muted">
          New and changed appointments from parents, newest first.
        </p>
      </header>

      <ul className="flex w-full max-w-3xl flex-col gap-3 px-5 py-3">
        {items === null && loadError ? (
          <div className="col-span-full">
            <ErrorState message={loadError} onRetry={() => window.location.reload()} />
          </div>
        ) : items === null ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Bell className="size-8" />}
            title="No notifications"
            description="When a parent books or moves an appointment, it shows up here."
          />
        ) : (
          items.map((item) => {
            const rendered = renderNotification(item.type, item.payload);
            const isNew = fresh.has(item.id);

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

                {item.type === "booking_request" && item.appointmentStatus && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <AppointmentStatusPill status={item.appointmentStatus} />
                    <Link
                      href="/admin/appointments"
                      className="flex min-h-11 items-center text-sm font-semibold text-primary-700 dark:text-primary-300"
                    >
                      See all bookings
                    </Link>
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
