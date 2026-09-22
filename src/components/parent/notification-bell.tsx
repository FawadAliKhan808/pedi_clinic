"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import type { AppNotification, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { cn } from "@/lib/format";
import { renderNotification } from "@/lib/notifications/templates";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  const time = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return today
    ? time
    : `${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

/**
 * The in-app notification list. Everything pushed also lands here, so a parent
 * without notifications turned on — or whose push never arrived — still sees
 * it the next time they open the app.
 */
export function NotificationBell({ userId }: { userId: UUID }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(
    () =>
      getBrowserApi()
        .notifications.listMine()
        .then(setNotifications)
        .catch(() => undefined),
    []
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () => getBrowserApi().realtime.subscribeToNotifications(userId, () => void refresh()),
    [userId, refresh]
  );

  const unread = notifications.filter((notification) => !notification.readAt).length;

  function openList() {
    setOpen(true);
    if (unread > 0) {
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((notification) => ({ ...notification, readAt: notification.readAt ?? readAt }))
      );
      void getBrowserApi().notifications.markRead().catch(() => undefined);
    }
  }

  return (
    <>
      <button
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={openList}
        className="relative flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-2 top-2 flex min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold leading-5 text-foreground-on-accent">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Notifications">
        {notifications.length === 0 ? (
          <EmptyState
            icon={<Bell className="size-8" />}
            title="Nothing yet"
            description="We'll let you know here when you're 3rd in line and when it's your turn."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {notifications.map((notification) => {
              const rendered = renderNotification(notification.type, notification.payload);
              return (
                <Link
                  key={notification.id}
                  href={rendered.url}
                  onClick={() => setOpen(false)}
                  className="block"
                >
                  <Card className={cn("flex flex-col gap-1", !notification.readAt && "border-accent-300")}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-foreground">{rendered.title}</p>
                      <span className="shrink-0 text-xs text-foreground-muted">
                        {formatWhen(notification.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground-muted">{rendered.body}</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </Sheet>
    </>
  );
}
