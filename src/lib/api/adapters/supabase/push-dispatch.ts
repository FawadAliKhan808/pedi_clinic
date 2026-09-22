import "server-only";

import { renderNotification } from "@/lib/notifications/templates";
import { sendPush } from "@/lib/push/web-push";
import { createServiceRoleSupabaseClient } from "./client.server";
import { mapNotificationRow } from "./mappers";

export interface DispatchResult {
  claimed: number;
  sent: number;
  failed: number;
  removedSubscriptions: number;
}

/**
 * Pushes every notification nobody has tried to deliver yet. Claiming is
 * atomic in the database (FOR UPDATE SKIP LOCKED), so concurrent dispatches
 * never push the same notification twice. A notification counts as sent once
 * any one of the recipient's devices accepted it; the in-app list covers the
 * rest either way.
 */
export async function dispatchPendingPushes(): Promise<DispatchResult> {
  const db = createServiceRoleSupabaseClient();
  const result: DispatchResult = { claimed: 0, sent: 0, failed: 0, removedSubscriptions: 0 };

  const { data: claimed, error } = await db.rpc("claim_pending_pushes", { p_limit: 50 });
  if (error) throw new Error(`claim_pending_pushes: ${error.message}`);
  if (!claimed || claimed.length === 0) return result;

  result.claimed = claimed.length;
  const notifications = claimed.map(mapNotificationRow);

  const userIds = [...new Set(notifications.map((n) => n.userId))];
  const { data: subscriptions, error: subscriptionError } = await db
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (subscriptionError) {
    throw new Error(`push_subscriptions: ${subscriptionError.message}`);
  }

  const deliveredIds: string[] = [];
  const goneSubscriptionIds = new Set<string>();

  for (const notification of notifications) {
    const targets = (subscriptions ?? []).filter(
      (subscription) =>
        subscription.user_id === notification.userId &&
        !goneSubscriptionIds.has(subscription.id)
    );
    if (targets.length === 0) continue;

    const message = {
      ...renderNotification(notification.type, notification.payload),
      // Replaces an earlier alert for the same visit instead of stacking.
      tag: `${notification.type}:${notification.visitId ?? notification.id}`,
    };

    const outcomes = await Promise.all(
      targets.map(async (target) => {
        const outcome = await sendPush(target, message);
        if (outcome === "gone") goneSubscriptionIds.add(target.id);
        return outcome;
      })
    );

    if (outcomes.includes("sent")) {
      deliveredIds.push(notification.id);
      result.sent += 1;
    } else {
      result.failed += 1;
    }
  }

  if (deliveredIds.length > 0) {
    await db.rpc("mark_pushes_sent", { p_ids: deliveredIds });
  }
  if (goneSubscriptionIds.size > 0) {
    await db.from("push_subscriptions").delete().in("id", [...goneSubscriptionIds]);
    result.removedSubscriptions = goneSubscriptionIds.size;
  }

  return result;
}
