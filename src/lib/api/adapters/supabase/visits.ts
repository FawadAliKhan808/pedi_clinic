import type {
  ChildVisitHistoryEntry,
  UUID,
  Visit,
  VisitSummary,
} from "../../types";
import type { CompleteVisitInput, VisitsApi } from "../../visits";
import type { TypedSupabaseClient } from "./client.browser";
import { toApiError } from "./errors";
import { mapVisitRow } from "./mappers";

export class SupabaseVisitsApi implements VisitsApi {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getVisit(visitId: UUID): Promise<Visit> {
    const { data, error } = await this.client
      .from("visits")
      .select("*")
      .eq("id", visitId)
      .single();

    if (error) throw toApiError(error, "VISIT_LOOKUP_FAILED");
    return mapVisitRow(data);
  }

  async getVisitSummary(visitId: UUID): Promise<VisitSummary | null> {
    const { data, error } = await this.client.rpc("visit_summary", {
      p_visit_id: visitId,
    });
    if (error) throw toApiError(error, "VISIT_SUMMARY_FAILED");

    const row = data?.[0];
    if (!row) return null;

    return {
      visitId: row.visit_id,
      childId: row.child_id,
      childName: row.child_name,
      visitDate: row.visit_date,
      seq: row.seq,
      status: row.status,
      reason: row.reason,
      feeTotal: row.fee_total,
      followUpDate: row.follow_up_date,
      completedAt: row.completed_at,
      storageKeys: row.storage_keys ?? [],
      ratingStars: row.rating_stars,
    };
  }

  async getChildHistory(childId: UUID): Promise<ChildVisitHistoryEntry[]> {
    const { data, error } = await this.client.rpc("child_visit_history", {
      p_child_id: childId,
    });
    if (error) throw toApiError(error, "CHILD_HISTORY_FAILED");

    return (data ?? []).map((row) => ({
      visitId: row.visit_id,
      visitDate: row.visit_date,
      status: row.status,
      reason: row.reason,
      feeTotal: row.fee_total,
      followUpDate: row.follow_up_date,
      completedAt: row.completed_at,
      storageKeys: row.storage_keys ?? [],
    }));
  }

  async completeVisit(input: CompleteVisitInput): Promise<Visit> {
    const { data, error } = await this.client.rpc("complete_visit", {
      p_visit_id: input.visitId,
      p_consultation: input.fees.consultation,
      p_vaccination: input.fees.vaccination,
      p_other: input.fees.other,
      p_payments: input.payments,
      p_follow_up_date: input.followUpDate ?? undefined,
      p_prescription_keys: input.prescriptionStorageKeys ?? undefined,
    });

    if (error) throw toApiError(error, "COMPLETE_VISIT_FAILED");
    return mapVisitRow(data);
  }

  async submitRating(visitId: UUID, stars: 1 | 2 | 3 | 4 | 5): Promise<void> {
    // Insert, not upsert: a visit is rated once, and the prompt is only shown
    // while `ratingStars` is still null.
    const { error } = await this.client
      .from("ratings")
      .insert({ visit_id: visitId, stars });

    if (error) throw toApiError(error, "SUBMIT_RATING_FAILED");
  }
}
