import type { QueueApi } from "../../queue";
import type {
  ChildSearchResult,
  DoctorQueueEntry,
  ISODateString,
  ParentQueueEntry,
  UUID,
  Visit,
  VisitReason,
} from "../../types";
import type { TypedSupabaseClient } from "./client.browser";
import { toApiError } from "./errors";
import { mapVisitRow } from "./mappers";

export class SupabaseQueueApi implements QueueApi {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getParentQueueView(): Promise<ParentQueueEntry[]> {
    const { data, error } = await this.client.rpc("parent_queue_view");
    if (error) throw toApiError(error, "PARENT_QUEUE_VIEW_FAILED");

    return (data ?? []).map((row) => ({
      visitId: row.visit_id,
      clinicId: row.clinic_id,
      childId: row.child_id,
      childName: row.child_name,
      visitDate: row.visit_date,
      seq: row.seq,
      status: row.status,
      reason: row.reason,
      nowServingSeq: row.now_serving_seq,
      patientsAhead: row.patients_ahead,
    }));
  }

  async getDoctorQueue(clinicId: UUID): Promise<DoctorQueueEntry[]> {
    const { data, error } = await this.client.rpc("doctor_queue", {
      p_clinic_id: clinicId,
    });
    if (error) throw toApiError(error, "DOCTOR_QUEUE_FAILED");

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
      isReturning: row.is_returning,
      hasAppointment: row.has_appointment,
      calledAt: row.called_at,
      createdAt: row.created_at,
    }));
  }

  async checkIn(input: {
    childId: UUID;
    visitReason: VisitReason;
    checkInCode: string;
    appointmentId?: UUID;
  }): Promise<Visit> {
    const { data, error } = await this.client.rpc("check_in", {
      p_child_id: input.childId,
      p_visit_reason: input.visitReason,
      p_checkin_code: input.checkInCode,
      p_appointment_id: input.appointmentId ?? undefined,
    });
    if (error) throw toApiError(error, "CHECK_IN_FAILED");
    return mapVisitRow(data);
  }

  async getCheckInQrCode(): Promise<{ code: string; expiresAt: string }> {
    const { data, error } = await this.client.rpc("checkin_qr_code");
    if (error) throw toApiError(error, "CHECKIN_QR_FAILED");
    const row = data as { code: string; expires_at: string };
    return { code: row.code, expiresAt: row.expires_at };
  }

  async call(visitId: UUID): Promise<Visit> {
    return this.transition("call_visit", visitId, "CALL_FAILED");
  }

  async recall(visitId: UUID): Promise<Visit> {
    return this.transition("call_visit", visitId, "RECALL_FAILED");
  }

  async startConsultation(visitId: UUID): Promise<Visit> {
    return this.transition("start_consultation", visitId, "START_CONSULTATION_FAILED");
  }

  async skip(visitId: UUID): Promise<Visit> {
    return this.transition("skip_visit", visitId, "SKIP_FAILED");
  }

  async remove(visitId: UUID): Promise<Visit> {
    return this.transition("remove_visit", visitId, "REMOVE_FAILED");
  }

  private async transition(
    fn: "call_visit" | "start_consultation" | "skip_visit" | "remove_visit",
    visitId: UUID,
    fallbackCode: string
  ): Promise<Visit> {
    const { data, error } = await this.client.rpc(fn, { p_visit_id: visitId });
    if (error) throw toApiError(error, fallbackCode);
    return mapVisitRow(data);
  }

  async searchChildren(clinicId: UUID, query: string): Promise<ChildSearchResult[]> {
    const { data, error } = await this.client.rpc("search_children", {
      p_clinic_id: clinicId,
      p_query: query,
    });
    if (error) throw toApiError(error, "CHILD_SEARCH_FAILED");

    return (data ?? []).map((row) => ({
      childId: row.child_id,
      childName: row.child_name,
      dob: row.dob,
      parentId: row.parent_id,
      parentName: row.parent_name,
      parentPhone: row.parent_phone,
      lastVisitDate: row.last_visit_date,
    }));
  }

  async addWalkIn(input: {
    clinicId: UUID;
    name: string;
    dob: ISODateString;
    parentPhone: string;
    visitReason: VisitReason;
  }): Promise<Visit> {
    const { data, error } = await this.client.rpc("add_walk_in", {
      p_clinic_id: input.clinicId,
      p_child_name: input.name,
      p_child_dob: input.dob,
      p_parent_phone: input.parentPhone,
      p_visit_reason: input.visitReason,
    });
    if (error) throw toApiError(error, "ADD_WALK_IN_FAILED");
    return mapVisitRow(data);
  }
}
