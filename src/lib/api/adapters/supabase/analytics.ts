import type {
  AnalyticsApi,
  DateRange,
  DoctorAnalyticsSummary,
  EndOfDaySummary,
  OwnerOverview,
} from "../../analytics";
import type { ISODateString, UUID } from "../../types";
import type { TypedSupabaseClient } from "./client.browser";
import { toApiError } from "./errors";

/* The database returns these as JSON objects; the shapes are fixed by the SQL. */
type Json = Record<string, unknown>;
const num = (value: unknown): number => Number(value ?? 0);

export class SupabaseAnalyticsApi implements AnalyticsApi {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getDoctorAnalytics(clinicId: UUID, range: DateRange): Promise<DoctorAnalyticsSummary> {
    const { data, error } = await this.client.rpc("doctor_analytics", {
      p_clinic_id: clinicId,
      p_from: range.from,
      p_to: range.to,
    });
    if (error) throw toApiError(error, "ANALYTICS_FAILED");

    const raw = data as Json;
    const reasons = raw.visit_reasons as Json;
    const newVsReturning = raw.new_vs_returning as Json;
    const tokens = raw.tokens as Json;
    const walkIns = raw.walk_ins_vs_appointments as Json;
    const appointments = raw.appointments as Json;
    const followUps = raw.follow_ups as Json;

    return {
      daily: (raw.daily as Json[]).map((day) => ({
        date: String(day.date),
        patients: num(day.patients),
        consultation: num(day.consultation),
        vaccination: num(day.vaccination),
        other: num(day.other),
        cash: num(day.cash),
        upi: num(day.upi),
        card: num(day.card),
        pharmacy: num(day.pharmacy),
        pharmacyOrders: num(day.pharmacy_orders),
      })),
      visitReasons: {
        vaccination: num(reasons.vaccination),
        general_checkup: num(reasons.general_checkup),
      },
      newVsReturning: { new: num(newVsReturning.new), returning: num(newVsReturning.returning) },
      averageConsultationMinutes:
        raw.average_consultation_minutes === null
          ? null
          : num(raw.average_consultation_minutes),
      checkInHours: (raw.check_in_hours as Json[]).map((row) => ({
        hour: num(row.hour),
        count: num(row.count),
      })),
      tokens: { total: num(tokens.total), skipped: num(tokens.skipped), removed: num(tokens.removed) },
      walkInsVsAppointments: {
        walkIns: num(walkIns.walk_ins),
        appointments: num(walkIns.appointments),
      },
      appointments: { attended: num(appointments.attended), missed: num(appointments.missed) },
      followUps: { due: num(followUps.due), returned: num(followUps.returned) },
    };
  }

  async getEndOfDaySummary(clinicId: UUID, date: ISODateString): Promise<EndOfDaySummary> {
    const { data, error } = await this.client.rpc("end_of_day_summary", {
      p_clinic_id: clinicId,
      p_date: date,
    });
    if (error) throw toApiError(error, "END_OF_DAY_FAILED");

    const raw = data as Json;
    const byMode = raw.by_mode as Json;
    const byFeeType = raw.by_fee_type as Json;
    const appointments = raw.appointments as Json;
    const pharmacy = raw.pharmacy as Json;

    return {
      date: String(raw.date),
      patientsSeen: num(raw.patients_seen),
      byMode: { cash: num(byMode.cash), upi: num(byMode.upi), card: num(byMode.card) },
      byFeeType: {
        consultation: num(byFeeType.consultation),
        vaccination: num(byFeeType.vaccination),
        other: num(byFeeType.other),
      },
      pharmacy: { total: num(pharmacy.total), orders: num(pharmacy.orders) },
      appointments: {
        attended: num(appointments.attended),
        missed: num(appointments.missed),
        notArrived: num(appointments.not_arrived),
      },
    };
  }

  async getOwnerOverview(): Promise<OwnerOverview> {
    const { data, error } = await this.client.rpc("owner_overview");
    if (error) throw toApiError(error, "OWNER_OVERVIEW_FAILED");

    const raw = data as Json;
    const ratings = raw.ratings as Json;
    const distribution = ratings.distribution as Json;
    const adoption = raw.adoption as Json;
    const usage = raw.usage as Json;

    return {
      ratings: {
        count: num(ratings.count),
        average: ratings.average === null ? null : num(ratings.average),
        distribution: {
          1: num(distribution["1"]),
          2: num(distribution["2"]),
          3: num(distribution["3"]),
          4: num(distribution["4"]),
          5: num(distribution["5"]),
        },
      },
      adoption: {
        parentsRegistered: num(adoption.parents_registered),
        installed: num(adoption.installed),
        notificationsEnabled: num(adoption.notifications_enabled),
      },
      usage: { appTokens: num(usage.app_tokens), walkIns: num(usage.walk_ins) },
    };
  }
}
