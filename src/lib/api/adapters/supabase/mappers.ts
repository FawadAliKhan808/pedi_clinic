import type { Child, Parent, StaffRole } from "../../types";
import type { Database } from "./database.types";

type ChildRow = Database["public"]["Tables"]["children"]["Row"];
type ParentRow = Database["public"]["Tables"]["parents"]["Row"];

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

export function isStaffRole(value: string): value is StaffRole {
  return value === "doctor" || value === "pharmacist" || value === "owner";
}
