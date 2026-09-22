import type { PharmacyApi } from "../../pharmacy";
import type { Medicine, PharmacyFeedEntry, PharmacyOrder, UUID } from "../../types";
import type { TypedSupabaseClient } from "./client.browser";
import { toApiError } from "./errors";
import { mapMedicineRow, mapPharmacyOrderRow } from "./mappers";

export class SupabasePharmacyApi implements PharmacyApi {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getFeed(clinicId: UUID): Promise<PharmacyFeedEntry[]> {
    const { data, error } = await this.client.rpc("pharmacy_feed", {
      p_clinic_id: clinicId,
    });
    if (error) throw toApiError(error, "PHARMACY_FEED_FAILED");

    return (data ?? []).map((row) => ({
      orderId: row.order_id,
      visitId: row.visit_id,
      seq: row.seq,
      childName: row.child_name,
      childDob: row.child_dob,
      reason: row.reason,
      completedAt: row.completed_at,
      storageKeys: row.storage_keys ?? [],
    }));
  }

  async listMedicines(clinicId: UUID): Promise<Medicine[]> {
    const { data, error } = await this.client
      .from("medicines")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("name");

    if (error) throw toApiError(error, "MEDICINE_LIST_FAILED");
    return (data ?? []).map(mapMedicineRow);
  }

  async searchMedicines(clinicId: UUID, query: string): Promise<Medicine[]> {
    const { data, error } = await this.client
      .from("medicines")
      .select("*")
      .eq("clinic_id", clinicId)
      .ilike("name", `%${query}%`)
      .order("name")
      .limit(25);

    if (error) throw toApiError(error, "MEDICINE_SEARCH_FAILED");
    return (data ?? []).map(mapMedicineRow);
  }

  async dispense(input: {
    visitId: UUID;
    items: { medicineId: UUID; quantity: number }[];
  }): Promise<PharmacyOrder> {
    const { data, error } = await this.client.rpc("dispense_order", {
      p_visit_id: input.visitId,
      p_items: input.items.map((item) => ({
        medicine_id: item.medicineId,
        quantity: item.quantity,
      })),
    });

    if (error) throw toApiError(error, "DISPENSE_FAILED");
    return mapPharmacyOrderRow(data);
  }

  async skipOrder(visitId: UUID): Promise<PharmacyOrder> {
    const { data, error } = await this.client.rpc("skip_pharmacy_order", {
      p_visit_id: visitId,
    });
    if (error) throw toApiError(error, "SKIP_ORDER_FAILED");
    return mapPharmacyOrderRow(data);
  }

  async restock(medicineId: UUID, quantity: number): Promise<Medicine> {
    const { data, error } = await this.client.rpc("restock_medicine", {
      p_medicine_id: medicineId,
      p_quantity: quantity,
    });
    if (error) throw toApiError(error, "RESTOCK_FAILED");
    return mapMedicineRow(data);
  }

  async addMedicine(input: {
    clinicId: UUID;
    name: string;
    unit: string;
    unitPrice: number;
    initialStock: number;
    lowStockThreshold: number;
  }): Promise<Medicine> {
    const { data, error } = await this.client.rpc("add_medicine", {
      p_clinic_id: input.clinicId,
      p_name: input.name,
      p_unit: input.unit,
      p_unit_price: input.unitPrice,
      p_initial_stock: input.initialStock,
      p_low_stock_threshold: input.lowStockThreshold,
    });
    if (error) throw toApiError(error, "ADD_MEDICINE_FAILED");
    return mapMedicineRow(data);
  }
}
