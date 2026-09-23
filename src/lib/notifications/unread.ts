"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserApi } from "@/lib/api/browser";

/**
 * In-page signal that the signed-in user's notifications changed — something
 * arrived, was read, decided or deleted. The nav badge and the notifications
 * screen both listen, so one realtime subscription serves both.
 */
const NOTIFICATIONS_CHANGED = "pedi:notifications-changed";

export function announceNotificationsChanged(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export function onNotificationsChanged(listener: () => void): () => void {
  window.addEventListener(NOTIFICATIONS_CHANGED, listener);
  return () => window.removeEventListener(NOTIFICATIONS_CHANGED, listener);
}

/**
 * Live unread count for the signed-in user. Owns the realtime subscription:
 * a new notification (or a reconnect) announces a change to everything
 * listening on the page.
 */
export function useUnreadNotificationCount(): number {
  const [count, setCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    getBrowserApi()
      .auth.getCurrentUserId()
      .then(setUserId)
      .catch(() => undefined);
  }, []);

  const refresh = useCallback(() => {
    getBrowserApi()
      .notifications.listMine()
      .then((list) => setCount(list.filter((item) => !item.readAt).length))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!userId) return;
    const stopListening = onNotificationsChanged(refresh);
    const unsubscribe = getBrowserApi().realtime.subscribeToNotifications(
      userId,
      announceNotificationsChanged
    );
    return () => {
      stopListening();
      unsubscribe();
    };
  }, [userId, refresh]);

  return count;
}
