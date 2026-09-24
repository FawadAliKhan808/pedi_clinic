"use client";

import { useSyncExternalStore } from "react";
import { getBrowserApi } from "@/lib/api/browser";

export type PermissionState = "unsupported" | "default" | "granted" | "denied";

/** iOS only exposes Notification/PushManager inside the installed app (16.4+). */
export function notificationPermission(): PermissionState {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return "unsupported";
  }
  return Notification.permission;
}

// Everything showing the permission (the notification card, the pop-up)
// reads it through one store, so a grant in one place updates the others.
const permissionListeners = new Set<() => void>();

function notifyPermissionChanged() {
  for (const listener of permissionListeners) listener();
}

function subscribePermission(listener: () => void) {
  permissionListeners.add(listener);
  // The parent may change it in phone settings and come back to the app.
  const onVisible = () => {
    if (document.visibilityState === "visible") listener();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    permissionListeners.delete(listener);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** The live notification permission; "unsupported" on the server and where push isn't available. */
export function useNotificationPermission(): PermissionState {
  return useSyncExternalStore(subscribePermission, notificationPermission, () => "unsupported");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Subscribes this device to Web Push and stores the subscription server-side.
 * Safe to repeat: browsers occasionally rotate subscriptions, so the installed
 * app re-syncs on every open while permission is granted.
 */
export async function syncPushSubscription(): Promise<void> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Browser returned an incomplete push subscription");
  }

  await getBrowserApi().notifications.registerPushSubscription({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
}

/**
 * Must run from a tap: browsers only show the permission prompt in response
 * to a user gesture.
 */
export async function enableNotifications(): Promise<PermissionState> {
  const result = await Notification.requestPermission();
  notifyPermissionChanged();
  if (result === "granted") {
    await syncPushSubscription();
    await getBrowserApi().notifications.recordNotificationsEnabled();
  }
  return result;
}
