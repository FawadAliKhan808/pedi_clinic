import type { AppNotification, UUID } from "./types";

export interface NotificationsApi {
  listMine(): Promise<AppNotification[]>;
  markRead(notificationId: UUID): Promise<void>;

  /** Registers a Web Push (VAPID) subscription for the current user. */
  registerPushSubscription(subscription: PushSubscriptionJSON): Promise<void>;
  /** Records that the current parent has installed the PWA (fires once). */
  recordInstall(): Promise<void>;
}
