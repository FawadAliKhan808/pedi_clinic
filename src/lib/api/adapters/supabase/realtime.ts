import type { RealtimeApi, Unsubscribe } from "../../realtime";
import type { UUID } from "../../types";
import type { TypedSupabaseClient } from "./client.browser";

export class SupabaseRealtimeApi implements RealtimeApi {
  constructor(private readonly client: TypedSupabaseClient) {}

  /**
   * Listens to the clinic's queue broadcast. The payload carries no personal
   * data — it only says "the queue moved" — so each side refetches its own
   * read model.
   */
  subscribeToQueue(clinicId: UUID, onChange: () => void): Unsubscribe {
    return this.subscribeToBroadcast(`queue:${clinicId}`, "queue_changed", onChange);
  }

  subscribeToPharmacyFeed(clinicId: UUID, onChange: () => void): Unsubscribe {
    return this.subscribeToBroadcast(
      `pharmacy:${clinicId}`,
      "pharmacy_changed",
      onChange
    );
  }

  subscribeToAppointments(clinicId: UUID, onChange: () => void): Unsubscribe {
    return this.subscribeToBroadcast(
      `appointments:${clinicId}`,
      "appointments_changed",
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

  /**
   * One broadcast channel, plus two catch-up paths: `onChange` fires on
   * (re)subscribe — recovering after a dropped connection — and when the
   * page becomes visible again, since a sleeping phone or background tab can
   * miss broadcasts without the socket ever reporting an error.
   */
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

    const onVisible = () => {
      if (document.visibilityState === "visible") onChange();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void this.client.removeChannel(channel);
    };
  }
}
