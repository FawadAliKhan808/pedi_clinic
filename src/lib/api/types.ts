/**
 * Domain types shared across every `src/lib/api/*` interface and adapter.
 * Pages/components import only from `src/lib/api` — never from a backend
 * SDK directly — so a future non-Supabase adapter only has to satisfy these
 * shapes.
 */

export type UUID = string;
/** 'YYYY-MM-DD', always an Asia/Kolkata calendar date. */
export type ISODateString = string;
export type ISODateTimeString = string;

export type StaffRole = "doctor" | "pharmacist" | "owner";

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
}

export interface DoctorQueueEntry {
  visitId: UUID;
  seq: number;
  status: VisitStatus;
  reason: VisitReason;
  childId: UUID;
  childName: string;
  childDob: ISODateString;
  parentPhone: string;
  isReturning: boolean;
  hasAppointment: boolean;
  calledAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
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
}

export interface OrderItem {
  orderId: UUID;
  medicineId: UUID;
  quantity: number;
  unitPrice: number;
}

export interface AvailabilitySession {
  id: UUID;
  clinicId: UUID;
  date: ISODateString;
  startTime: string;
  endTime: string;
  maxBookings: number;
  bookedCount: number;
}

export type AppointmentStatus = "booked" | "cancelled" | "missed" | "attended";

export interface Appointment {
  id: UUID;
  sessionId: UUID;
  childId: UUID;
  status: AppointmentStatus;
  createdAt: ISODateTimeString;
}

export interface AppNotification {
  id: UUID;
  userId: UUID;
  type: string;
  payload: Record<string, unknown>;
  sentAt: ISODateTimeString | null;
  readAt: ISODateTimeString | null;
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
