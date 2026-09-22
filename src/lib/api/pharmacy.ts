import type { Medicine, PharmacyFeedEntry, PharmacyOrder, UUID } from "./types";

export interface PharmacyApi {
  /** Completed visits still waiting on the pharmacy, oldest first. */
  getFeed(clinicId: UUID): Promise<PharmacyFeedEntry[]>;

  listMedicines(clinicId: UUID): Promise<Medicine[]>;
  searchMedicines(clinicId: UUID, query: string): Promise<Medicine[]>;

  /**
   * One transaction: locks each medicine, checks stock, deducts it and prices
   * the bill. Throws `INSUFFICIENT_STOCK:<name>` and changes nothing if any
   * line can't be filled.
   */
  dispense(input: {
    visitId: UUID;
    items: { medicineId: UUID; quantity: number }[];
  }): Promise<PharmacyOrder>;

  /** The parent is buying elsewhere — clears the visit off the feed. */
  skipOrder(visitId: UUID): Promise<PharmacyOrder>;

  /** Increments stock, so two restocks can't overwrite each other. */
  restock(medicineId: UUID, quantity: number): Promise<Medicine>;
  addMedicine(input: {
    clinicId: UUID;
    name: string;
    unit: string;
    unitPrice: number;
    initialStock: number;
    lowStockThreshold: number;
  }): Promise<Medicine>;
}
