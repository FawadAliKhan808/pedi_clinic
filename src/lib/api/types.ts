/**
 * Domain types shared across every `src/lib/api/*` interface and adapter.
 * Pages/components import only from `src/lib/api` — never from a backend
 * SDK directly — so a future non-Supabase adapter only has to satisfy these
 * shapes.
 */

import type { NotificationType } from "@/lib/notifications/templates";

export type { NotificationType };

export type UUID = string;
/** 'YYYY-MM-DD', always an Asia/Kolkata calendar date. */
export type ISODateString = string;
export type ISODateTimeString = string;

export type StaffRole = "doctor" | "pharmacist" | "receptionist" | "owner";

export interface Clinic {
  id: UUID;
  name: string;
  timezone: string;
}

export interface StaffMembership {
  userId: UUID;
  clinicId: UUID | null;
  role: StaffRole;
}

export interface Parent {
  id: UUID;
  /** Null for a doctor-created walk-in record, until that parent first signs in. */
  userId: UUID | null;
  phone: string;
  name: string | null;
}

export interface Child {
  id: UUID;
  parentId: UUID;
  name: string;
  dob: ISODateString;
}

export type VisitReason = "vaccination" | "general_checkup";
export type VisitStatus =
  | "waiting"
  | "called"
  | "in_consultation"
  | "completed"
  | "skipped"
  | "removed";

export interface Visit {
  id: UUID;
  clinicId: UUID;
  childId: UUID;
  visitDate: ISODateString;
  seq: number;
  status: VisitStatus;
  visitReason: VisitReason;
  appointmentId: UUID | null;
  calledAt: ISODateTimeString | null;
  completedAt: ISODateTimeString | null;
  followUpDate: ISODateString | null;
  createdAt: ISODateTimeString;
}

/** A parent's own view of one of their tokens — position counts, no other family's data. */
export interface ParentQueueEntry {
  visitId: UUID;
  clinicId: UUID;
  childId: UUID;
  childName: string;
  visitDate: ISODateString;
  seq: number;
  status: VisitStatus;
  reason: VisitReason;
  nowServingSeq: number | null;
  patientsAhead: number;
  /** Child's weight in kg at this visit, measured at the clinic. Null until recorded. */
  weightKg: number | null;
}

export interface DoctorQueueEntry {
  visitId: UUID;
  seq: number;
  status: VisitStatus;
  reason: VisitReason;
  childId: UUID;
  childName: string;
  childDob: ISODateString;
  /** Null until the parent has signed in and given their name (walk-ins). */
  parentName: string | null;
  parentPhone: string;
  isReturning: boolean;
  hasAppointment: boolean;
  calledAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  /** Child's weight in kg at this visit, measured at the clinic. Null until recorded. */
  weightKg: number | null;
}

export interface ChildSearchResult {
  childId: UUID;
  childName: string;
  dob: ISODateString;
  parentId: UUID;
  parentName: string | null;
  parentPhone: string;
  lastVisitDate: ISODateString | null;
}

export type PaymentMode = "cash" | "upi" | "card";

export interface Fees {
  visitId: UUID;
  consultation: number;
  vaccination: number;
  other: number;
}

export interface Payment {
  visitId: UUID;
  mode: PaymentMode;
  amount: number;
}

export interface PrescriptionImage {
  visitId: UUID;
  storageKey: string;
  order: number;
}

/** Everything the parent's post-visit screen shows. */
export interface VisitSummary {
  visitId: UUID;
  childId: UUID;
  childName: string;
  visitDate: ISODateString;
  seq: number;
  status: VisitStatus;
  reason: VisitReason;
  /** Null when the caller may not see money (the pharmacist), or none was recorded. */
  feeTotal: number | null;
  followUpDate: ISODateString | null;
  completedAt: ISODateTimeString | null;
  storageKeys: string[];
  /** The parent's own rating, so they aren't asked twice. */
  ratingStars: number | null;
  /** Child's weight in kg at this visit, measured at the clinic. Null until recorded. */
  weightKg: number | null;
}

export interface ChildVisitHistoryEntry {
  visitId: UUID;
  visitDate: ISODateString;
  status: VisitStatus;
  reason: VisitReason;
  /** Null when the caller may not see money (the pharmacist) or no fee was recorded. */
  feeTotal: number | null;
  followUpDate: ISODateString | null;
  completedAt: ISODateTimeString | null;
  storageKeys: string[];
}

/** A child who had a token on a given day — the doctor's patient history list. */
export interface DayPatient {
  visitId: UUID;
  seq: number;
  status: VisitStatus;
  reason: VisitReason;
  childId: UUID;
  childName: string;
  childDob: ISODateString;
  parentName: string | null;
  parentPhone: string;
  /** Completed visits at this clinic, all time. */
  visitCount: number;
}

/** A child found by the History search: consulted at least once here. */
export interface ConsultedChild {
  childId: UUID;
  childName: string;
  dob: ISODateString;
  parentName: string | null;
  parentPhone: string;
  lastConsultationDate: ISODateString;
  consultationCount: number;
}

/** One visit in a child's history, as the doctor sees it. */
export interface VisitTimelineEntry {
  visitId: UUID;
  visitDate: ISODateString;
  seq: number;
  status: VisitStatus;
  reason: VisitReason;
  fromAppointment: boolean;
  calledAt: ISODateTimeString | null;
  completedAt: ISODateTimeString | null;
  /** Null until the visit is completed. */
  fees: { consultation: number; vaccination: number; other: number } | null;
  payments: { mode: PaymentMode; amount: number }[];
  followUpDate: ISODateString | null;
  storageKeys: string[];
  pharmacy: {
    status: "pending" | "dispensed" | "skipped";
    total: number;
    medicines: { name: string; unit: string; quantity: number; unitPrice: number }[];
  } | null;
  /** Child's weight in kg at this visit, measured at the clinic. Null until recorded. */
  weightKg: number | null;
}

export interface Medicine {
  id: UUID;
  clinicId: UUID;
  name: string;
  unit: string;
  unitPrice: number;
  stock: number;
  lowStockThreshold: number;
}

export function isLowStock(medicine: Medicine): boolean {
  return medicine.stock <= medicine.lowStockThreshold;
}

export type PharmacyOrderStatus = "pending" | "dispensed" | "skipped";

export interface PharmacyOrder {
  id: UUID;
  visitId: UUID;
  clinicId: UUID;
  status: PharmacyOrderStatus;
  total: number;
  dispensedAt: ISODateTimeString | null;
}

/** A visit waiting on the pharmacy, with what it needs to be filled. */
export interface PharmacyFeedEntry {
  orderId: UUID;
  visitId: UUID;
  seq: number;
  childName: string;
  childDob: ISODateString;
  reason: VisitReason;
  completedAt: ISODateTimeString | null;
  storageKeys: string[];
  /** Weight recorded at this visit, for weight-based dosing. Null if none was. */
  weightKg: number | null;
}

export interface OrderItem {
  orderId: UUID;
  medicineId: UUID;
  quantity: number;
  unitPrice: number;
}

/** 'HH:MM' or 'HH:MM:SS', clinic-local. */
export type ClockTime = string;

export interface AvailabilitySession {
  id: UUID;
  clinicId: UUID;
  date: ISODateString;
  startTime: ClockTime;
  endTime: ClockTime;
  /** Confirmed or arrived bookings. Sessions have no capacity. */
  bookedCount: number;
}

/** One of the doctor's one-tap sessions (setting `session_presets`), e.g. Evening 18:00–21:00. */
export interface SessionPreset {
  label: string;
  startTime: ClockTime;
  endTime: ClockTime;
}

/** "Today" and the bookable range, as the clinic's timezone and settings define them. */
export interface BookingWindow {
  clinicId: UUID;
  today: ISODateString;
  fromDate: ISODateString;
  toDate: ISODateString;
  sessionPresets: SessionPreset[];
}

/**
 * A booking is confirmed ('booked') the moment it's made. 'pending' and
 * 'rejected' only exist on rows from the retired approval flow.
 */
export type AppointmentStatus =
  | "pending"
  | "booked"
  | "rejected"
  | "cancelled"
  | "missed"
  | "attended";

export interface Appointment {
  id: UUID;
  sessionId: UUID;
  childId: UUID;
  appointmentDate: ISODateString;
  visitReason: VisitReason;
  status: AppointmentStatus;
  createdAt: ISODateTimeString;
}

/** One of the signed-in parent's upcoming bookings. */
export interface ParentAppointment {
  appointmentId: UUID;
  childId: UUID;
  childName: string;
  sessionId: UUID;
  date: ISODateString;
  startTime: ClockTime;
  endTime: ClockTime;
  visitReason: VisitReason;
  status: AppointmentStatus;
}

export interface ClinicAppointment {
  appointmentId: UUID;
  status: AppointmentStatus;
  visitReason: VisitReason;
  childId: UUID;
  childName: string;
  childDob: ISODateString;
  parentName: string | null;
  parentPhone: string;
  /** The token it was linked to on arrival, if any. */
  tokenSeq: number | null;
}

/** A session with its bookings — the doctor's appointments view. */
export interface ClinicSessionSchedule {
  sessionId: UUID;
  date: ISODateString;
  startTime: ClockTime;
  endTime: ClockTime;
  bookedCount: number;
  /** Everyone who booked it (confirmed, arrived or missed), in booking order. */
  appointments: ClinicAppointment[];
}

export interface AppNotification {
  id: UUID;
  userId: UUID;
  type: NotificationType;
  visitId: UUID | null;
  /** The appointment it's about, if any (the "reference"). */
  appointmentId: UUID | null;
  /** That appointment's current status — lets an inbox show whether a request is still open. */
  appointmentStatus: AppointmentStatus | null;
  payload: Record<string, unknown>;
  createdAt: ISODateTimeString;
  sentAt: ISODateTimeString | null;
  readAt: ISODateTimeString | null;
}

export interface InstallStatus {
  installedAt: ISODateTimeString;
  notificationsEnabledAt: ISODateTimeString | null;
}

/** Error thrown by every adapter method on failure — pages branch on `code`, never on message text. */
export class ApiError extends Error {
  code: string;
  cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.cause = cause;
  }
}
