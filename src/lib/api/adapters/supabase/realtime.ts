import type { RealtimeApi, Unsubscribe } from "../../realtime";
import { ApiError, type UUID } from "../../types";
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
    const channel = this.client
      .channel(`queue:${clinicId}`)
      .on("broadcast", { event: "queue_changed" }, () => onChange())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") onChange();
      });

    return () => {
      void this.client.removeChannel(channel);
    };
  }

  subscribeToPharmacyFeed(): Unsubscribe {
    throw new ApiError(
      "RealtimeApi.subscribeToPharmacyFeed() is not implemented yet.",
      "NOT_IMPLEMENTED"
    );
  }

  subscribeToNotifications(): Unsubscribe {
    throw new ApiError(
      "RealtimeApi.subscribeToNotifications() is not implemented yet.",
      "NOT_IMPLEMENTED"
    );
  }
}
