import type { AppNotification, InstallStatus } from "./types";

/** The keys a browser `PushSubscription.toJSON()` produces. */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface NotificationsApi {
  /** Newest first. The fallback list, whether or not a push got through. */
  listMine(): Promise<AppNotification[]>;
  /** Marks the given notifications read, or all of the caller's when omitted. */
  markRead(notificationIds?: string[]): Promise<void>;

  /** Stores this device's Web Push subscription for the signed-in user. */
  registerPushSubscription(subscription: PushSubscriptionInput): Promise<void>;

  /** Recorded once by the installed app. */
  recordInstall(): Promise<void>;
  recordNotificationsEnabled(): Promise<void>;
  /** Null until the parent has opened the installed app at least once. */
  getMyInstallStatus(): Promise<InstallStatus | null>;

  /**
   * Asks the server to push any notifications waiting to go out. Called after
   * actions that change the queue; delivery itself needs the server's private
   * key, so it never runs in the browser.
   */
  dispatchPending(): Promise<void>;
}
