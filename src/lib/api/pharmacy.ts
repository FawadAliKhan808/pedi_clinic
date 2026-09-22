import type { Medicine, PharmacyOrder, UUID } from "./types";

export interface PharmacyApi {
  getFeed(clinicId: UUID): Promise<PharmacyOrder[]>;
  searchMedicines(clinicId: UUID, query: string): Promise<Medicine[]>;

  /** Single atomic transaction: deducts stock and computes the bill, rejects on insufficient stock. */
  dispense(input: {
    visitId: UUID;
    items: { medicineId: UUID; quantity: number }[];
  }): Promise<PharmacyOrder>;

  /** Parent is buying medicines elsewhere — clears the visit from the feed. */
  skipOrder(visitId: UUID): Promise<void>;

  restock(medicineId: UUID, quantity: number): Promise<Medicine>;
  addMedicine(input: {
    name: string;
    unit: string;
    initialStock: number;
    lowStockThreshold: number;
  }): Promise<Medicine>;
}
