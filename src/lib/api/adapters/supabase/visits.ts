import type {
  ChildVisitHistoryEntry,
  DayPatient,
  ISODateString,
  PaymentMode,
  UUID,
  Visit,
  VisitSummary,
  VisitTimelineEntry,
} from "../../types";
import type { CompleteVisitInput, VisitsApi } from "../../visits";
import type { TypedSupabaseClient } from "./client.browser";
import { toApiError } from "./errors";
import { mapVisitRow } from "./mappers";

/** jsonb arrays from the timeline, read defensively. */
function jsonArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : [];
}

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
    const { error } = await this.client.rpc("submit_app_rating", {
      p_visit_id: visitId,
      p_stars: stars,
    });
    if (error) throw toApiError(error, "SUBMIT_RATING_FAILED");
  }

  async hasRatedApp(): Promise<boolean> {
    const { data, error } = await this.client.rpc("has_rated_app");
    if (error) throw toApiError(error, "RATING_LOOKUP_FAILED");
    return Boolean(data);
  }

  async listPatientsOn(clinicId: UUID, date: ISODateString): Promise<DayPatient[]> {
    const { data, error } = await this.client.rpc("clinic_patients_on", {
      p_clinic_id: clinicId,
      p_date: date,
    });
    if (error) throw toApiError(error, "PATIENTS_ON_DAY_FAILED");

    return (data ?? []).map((row) => ({
      visitId: row.visit_id,
      seq: row.seq,
      status: row.status,
      reason: row.reason,
      childId: row.child_id,
      childName: row.child_name,
      childDob: row.child_dob,
      parentName: row.parent_name,
      parentPhone: row.parent_phone,
      visitCount: row.visit_count,
    }));
  }

  async getChildTimeline(childId: UUID): Promise<VisitTimelineEntry[]> {
    const { data, error } = await this.client.rpc("child_visit_timeline", {
      p_child_id: childId,
    });
    if (error) throw toApiError(error, "CHILD_TIMELINE_FAILED");

    return (data ?? []).map((row) => ({
      visitId: row.visit_id,
      visitDate: row.visit_date,
      seq: row.seq,
      status: row.status,
      reason: row.reason,
      fromAppointment: row.from_appointment,
      calledAt: row.called_at,
      completedAt: row.completed_at,
      fees:
        row.consultation === null
          ? null
          : {
              consultation: Number(row.consultation),
              vaccination: Number(row.vaccination ?? 0),
              other: Number(row.other ?? 0),
            },
      payments: jsonArray(row.payments).map((item) => ({
        mode: item.mode as PaymentMode,
        amount: Number(item.amount),
      })),
      followUpDate: row.follow_up_date,
      storageKeys: row.storage_keys ?? [],
      pharmacy:
        row.pharmacy_status === null
          ? null
          : {
              status: row.pharmacy_status,
              total: Number(row.pharmacy_total ?? 0),
              medicines: jsonArray(row.medicines).map((item) => ({
                name: String(item.name),
                unit: String(item.unit),
                quantity: Number(item.quantity),
                unitPrice: Number(item.unit_price),
              })),
            },
    }));
  }
}
