import { ApiError, type ChildVisitHistoryEntry, type UUID, type Visit } from "../../types";
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

  async submitRating(): Promise<void> {
    throw new ApiError(
      "VisitsApi.submitRating() is not implemented yet.",
      "NOT_IMPLEMENTED"
    );
  }
}
