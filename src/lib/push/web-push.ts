import "server-only";

import webpush from "web-push";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushOutcome = "sent" | "gone" | "failed";

let configured = false;

function configure(): void {
  if (configured) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or VAPID_SUBJECT"
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

/**
 * Sends one encrypted Web Push message. "gone" means the push service says
 * this subscription no longer exists (the app was uninstalled or permission
 * revoked), so the caller should forget it.
 */
export async function sendPush(
  target: PushTarget,
  message: { title: string; body: string; url: string; tag: string }
): Promise<PushOutcome> {
  configure();

  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(message),
      // A queue alert that arrives an hour late is noise; let it expire.
      { TTL: 60 * 60, urgency: "high" }
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "failed";
  }
}
