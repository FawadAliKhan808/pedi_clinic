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
  userId: UUID;
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

export interface Medicine {
  id: UUID;
  name: string;
  unit: string;
  stock: number;
  lowStockThreshold: number;
}

export type PharmacyOrderStatus = "pending" | "dispensed" | "skipped";

export interface PharmacyOrder {
  id: UUID;
  visitId: UUID;
  status: PharmacyOrderStatus;
  total: number;
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
