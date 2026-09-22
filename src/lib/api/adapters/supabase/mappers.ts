import type {
  AppNotification,
  Child,
  Medicine,
  Parent,
  PharmacyOrder,
  StaffRole,
  Visit,
} from "../../types";
import type { Database } from "./database.types";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

type ChildRow = Database["public"]["Tables"]["children"]["Row"];
type ParentRow = Database["public"]["Tables"]["parents"]["Row"];
type VisitRow = Database["public"]["Tables"]["visits"]["Row"];
type MedicineRow = Database["public"]["Tables"]["medicines"]["Row"];
type PharmacyOrderRow = Database["public"]["Tables"]["pharmacy_orders"]["Row"];

export function mapParentRow(row: ParentRow): Parent {
  return {
    id: row.id,
    userId: row.user_id,
    phone: row.phone,
    name: row.name,
  };
}

export function mapChildRow(row: ChildRow): Child {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    dob: row.dob,
  };
}

export function mapVisitRow(row: VisitRow): Visit {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    childId: row.child_id,
    visitDate: row.visit_date,
    seq: row.seq,
    status: row.status,
    visitReason: row.visit_reason,
    appointmentId: row.appointment_id,
    calledAt: row.called_at,
    completedAt: row.completed_at,
    followUpDate: row.follow_up_date,
    createdAt: row.created_at,
  };
}

export function mapMedicineRow(row: MedicineRow): Medicine {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    name: row.name,
    unit: row.unit,
    unitPrice: row.unit_price,
    stock: row.stock,
    lowStockThreshold: row.low_stock_threshold,
  };
}

export function mapPharmacyOrderRow(row: PharmacyOrderRow): PharmacyOrder {
  return {
    id: row.id,
    visitId: row.visit_id,
    clinicId: row.clinic_id,
    status: row.status,
    total: row.total,
    dispensedAt: row.dispensed_at,
  };
}

export function mapNotificationRow(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    visitId: row.visit_id,
    payload:
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
    sentAt: row.sent_at,
    readAt: row.read_at,
  };
}

export function isStaffRole(value: string): value is StaffRole {
  return value === "doctor" || value === "pharmacist" || value === "owner";
}
