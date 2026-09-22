import type { ISODateString, PaymentMode, UUID, VisitReason } from "./types";

export interface DoctorAnalyticsRange {
  from: ISODateString;
  to: ISODateString;
}

export interface DoctorAnalyticsSummary {
  patientsPerDay: { date: ISODateString; count: number }[];
  visitReasonSplit: Record<VisitReason, number>;
  newVsReturning: { new: number; returning: number };
  revenue: {
    byDay: { date: ISODateString; total: number }[];
    byPaymentMode: Record<PaymentMode, number>;
  };
  averageConsultationMinutes: number;
  peakCheckInHours: { hour: number; count: number }[];
  skippedOrRemovedRate: number;
  walkInsVsAppointments: { walkIns: number; appointments: number };
  missedAppointments: number;
  followUpReturnRate: number;
}

export interface EndOfDaySummary {
  patientsSeen: number;
  totalsByPaymentMode: Record<PaymentMode, number>;
  totalsByFeeType: { consultation: number; vaccination: number; other: number };
  appointmentsAttended: number;
  appointmentsMissed: number;
}

export interface OwnerAdoptionSummary {
  parentsRegistered: number;
  parentsInstalled: number;
  parentsWithNotificationsEnabled: number;
  appTokens: number;
  manualWalkIns: number;
}

export interface OwnerRatingsSummary {
  average: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface AnalyticsApi {
  getDoctorSummary(
    clinicId: UUID,
    range: DoctorAnalyticsRange
  ): Promise<DoctorAnalyticsSummary>;
  getEndOfDaySummary(clinicId: UUID, date: ISODateString): Promise<EndOfDaySummary>;

  /** Owner-only. Never exposed to doctor/pharmacist roles. */
  getOwnerAdoption(): Promise<OwnerAdoptionSummary>;
  getOwnerRatings(): Promise<OwnerRatingsSummary>;
}
