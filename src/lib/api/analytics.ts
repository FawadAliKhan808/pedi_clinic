import type { ISODateString, PaymentMode, UUID, VisitReason } from "./types";

export interface DateRange {
  from: ISODateString;
  to: ISODateString;
}

/** One calendar day in the range, zero-filled so charts have no gaps. */
export interface DailyAnalytics {
  date: ISODateString;
  /** Completed visits. */
  patients: number;
  consultation: number;
  vaccination: number;
  other: number;
  cash: number;
  upi: number;
  card: number;
  /** Pharmacy sales dispensed that day (not part of consultation revenue). */
  pharmacy: number;
  pharmacyOrders: number;
}

export interface DoctorAnalyticsSummary {
  daily: DailyAnalytics[];
  visitReasons: Record<VisitReason, number>;
  newVsReturning: { new: number; returning: number };
  /** From consultation start (or call, for older visits) to completion. */
  averageConsultationMinutes: number | null;
  /** Tokens by clinic-local hour of check-in; only hours that had any. */
  checkInHours: { hour: number; count: number }[];
  tokens: { total: number; skipped: number; removed: number };
  walkInsVsAppointments: { walkIns: number; appointments: number };
  appointments: { attended: number; missed: number };
  /** Follow-ups due in the range, and how many of those children came back. */
  followUps: { due: number; returned: number };
}

export interface EndOfDaySummary {
  date: ISODateString;
  patientsSeen: number;
  byMode: Record<PaymentMode, number>;
  byFeeType: { consultation: number; vaccination: number; other: number };
  /** Medicines dispensed that day. */
  pharmacy: { total: number; orders: number };
  /** `notArrived`: still booked with no token — becomes "missed" once the day ends. */
  appointments: { attended: number; missed: number; notArrived: number };
}

export interface OwnerOverview {
  ratings: {
    count: number;
    average: number | null;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  };
  adoption: { parentsRegistered: number; installed: number; notificationsEnabled: number };
  usage: { appTokens: number; walkIns: number };
}

export interface AnalyticsApi {
  /** Doctor only. Revenue is never exposed to the pharmacist. */
  getDoctorAnalytics(clinicId: UUID, range: DateRange): Promise<DoctorAnalyticsSummary>;
  /** Doctor only. */
  getEndOfDaySummary(clinicId: UUID, date: ISODateString): Promise<EndOfDaySummary>;
  /** Owner only. Ratings and adoption are never exposed to clinic staff. */
  getOwnerOverview(): Promise<OwnerOverview>;
}
