import type { RealtimeApi, Unsubscribe } from "../../realtime";
import type { UUID } from "../../types";
import type { TypedSupabaseClient } from "./client.browser";

export class SupabaseRealtimeApi implements RealtimeApi {
  constructor(private readonly client: TypedSupabaseClient) {}

  /**
   * Listens to the clinic's queue broadcast. The payload carries no personal
   * data — it only says "the queue moved" — so each side refetches its own
   * read model. Re-firing `onChange` on (re)subscribe is what recovers state
   * after a dropped connection.
   */
  subscribeToQueue(clinicId: UUID, onChange: () => void): Unsubscribe {
    return this.subscribeToBroadcast(`queue:${clinicId}`, "queue_changed", onChange);
  }

  private subscribeToBroadcast(
    topic: string,
    event: string,
    onChange: () => void
  ): Unsubscribe {
    const channel = this.client
      .channel(topic)
      .on("broadcast", { event }, () => onChange())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") onChange();
      });

    return () => {
      void this.client.removeChannel(channel);
    };
  }

  subscribeToPharmacyFeed(clinicId: UUID, onChange: () => void): Unsubscribe {
    return this.subscribeToBroadcast(
      `pharmacy:${clinicId}`,
      "pharmacy_changed",
      onChange
    );
  }

  subscribeToNotifications(userId: UUID, onChange: () => void): Unsubscribe {
    return this.subscribeToBroadcast(
      `notifications:${userId}`,
      "notifications_changed",
      onChange
    );
  }
}
