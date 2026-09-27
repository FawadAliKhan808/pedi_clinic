import type { RealtimeApi, Unsubscribe } from "../../realtime";
import type { UUID } from "../../types";
import type { TypedSupabaseClient } from "./client.browser";

/** One live channel per topic, shared by every screen listening to it. */
interface SharedChannel {
  channel: ReturnType<TypedSupabaseClient["channel"]>;
  listeners: Set<() => void>;
  /** Connected (SUBSCRIBED) right now. */
  joined: boolean;
}

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

  subscribeToOwnerOverview(onChange: () => void): Unsubscribe {
    return this.subscribeToBroadcast("owner:overview", "overview_changed", onChange);
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
    // Supabase hands back the same channel for the same topic, so two
    // screens listening to one topic (the Queue page and the nav's queue dot)
    // share it. Count the listeners and close the channel only when the last
    // one leaves — otherwise leaving one screen silences the other.
    let shared = this.channels.get(topic);
    if (!shared) {
      const entry: SharedChannel = {
        channel: null as unknown as SharedChannel["channel"],
        listeners: new Set(),
        joined: false,
      };
      const notifyAll = () => entry.listeners.forEach((listener) => listener());
      entry.channel = this.client
        .channel(topic)
        .on("broadcast", { event }, notifyAll)
        .subscribe((status) => {
          entry.joined = status === "SUBSCRIBED";
          if (entry.joined) notifyAll();
        });
      shared = entry;
      this.channels.set(topic, shared);
    } else if (shared.joined) {
      // Already connected: this listener missed the join, so catch it up now,
      // as a fresh subscription would.
      queueMicrotask(onChange);
    }
    shared.listeners.add(onChange);

    const onVisible = () => {
      if (document.visibilityState === "visible") onChange();
    };
    document.addEventListener("visibilitychange", onVisible);

    const entry = shared;
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      entry.listeners.delete(onChange);
      if (entry.listeners.size === 0 && this.channels.get(topic) === entry) {
        this.channels.delete(topic);
        void this.client.removeChannel(entry.channel);
      }
    };
  }

  private readonly channels = new Map<string, SharedChannel>();
}
