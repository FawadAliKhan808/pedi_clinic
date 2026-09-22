"use client";

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
  if (result === "granted") {
    await syncPushSubscription();
    await getBrowserApi().notifications.recordNotificationsEnabled();
  }
  return result;
}
