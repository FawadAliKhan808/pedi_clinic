import type { Child, Parent, StaffRole, Visit } from "../../types";
import type { Database } from "./database.types";

type ChildRow = Database["public"]["Tables"]["children"]["Row"];
type ParentRow = Database["public"]["Tables"]["parents"]["Row"];
type VisitRow = Database["public"]["Tables"]["visits"]["Row"];

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

export function isStaffRole(value: string): value is StaffRole {
  return value === "doctor" || value === "pharmacist" || value === "owner";
}
