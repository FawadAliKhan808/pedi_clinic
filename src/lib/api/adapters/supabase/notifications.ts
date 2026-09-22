import type { NotificationsApi, PushSubscriptionInput } from "../../notifications";
import type { AppNotification, InstallStatus } from "../../types";
import type { TypedSupabaseClient } from "./client.browser";
import { toApiError } from "./errors";
import { mapNotificationRow } from "./mappers";

export class SupabaseNotificationsApi implements NotificationsApi {
  constructor(private readonly client: TypedSupabaseClient) {}

  async listMine(): Promise<AppNotification[]> {
    const { data, error } = await this.client
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw toApiError(error, "NOTIFICATIONS_LIST_FAILED");
    return (data ?? []).map(mapNotificationRow);
  }

  async markRead(notificationIds?: string[]): Promise<void> {
    const { error } = await this.client.rpc("mark_notifications_read", {
      p_ids: notificationIds,
    });
    if (error) throw toApiError(error, "NOTIFICATIONS_MARK_READ_FAILED");
  }

  async registerPushSubscription(subscription: PushSubscriptionInput): Promise<void> {
    const { error } = await this.client.rpc("register_push_subscription", {
      p_endpoint: subscription.endpoint,
      p_p256dh: subscription.keys.p256dh,
      p_auth: subscription.keys.auth,
    });
    if (error) throw toApiError(error, "PUSH_SUBSCRIPTION_FAILED");
  }

  async recordInstall(): Promise<void> {
    const { error } = await this.client.rpc("record_install");
    if (error) throw toApiError(error, "RECORD_INSTALL_FAILED");
  }

  async recordNotificationsEnabled(): Promise<void> {
    const { error } = await this.client.rpc("record_notifications_enabled");
    if (error) throw toApiError(error, "RECORD_NOTIFICATIONS_ENABLED_FAILED");
  }

  async getMyInstallStatus(): Promise<InstallStatus | null> {
    const { data, error } = await this.client
      .from("installs")
      .select("installed_at, notifications_enabled_at")
      .maybeSingle();

    if (error) throw toApiError(error, "INSTALL_STATUS_FAILED");
    return data
      ? {
          installedAt: data.installed_at,
          notificationsEnabledAt: data.notifications_enabled_at,
        }
      : null;
  }

  async dispatchPending(): Promise<void> {
    // Delivery needs the VAPID private key, so it runs in the app server; the
    // session cookie authorises the call. Failure is non-fatal — the in-app
    // list already has the notification.
    await fetch("/api/notifications/dispatch", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);
  }
}
