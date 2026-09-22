"use client";

import { AlertTriangle, Package, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { isLowStock, type Medicine, type UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatCurrency, parseAmount } from "@/lib/format";

export default function StockPage() {
  const toast = useToast();
  const [clinicId, setClinicId] = useState<UUID | null>(null);
  const [medicines, setMedicines] = useState<Medicine[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [restocking, setRestocking] = useState<Medicine | null>(null);

  useEffect(() => {
    getBrowserApi()
      .auth.getStaffRole()
      .then((staff) => setClinicId(staff?.clinicId ?? null))
      .catch((caught) => toast(errorMessage(caught), "error"));
  }, [toast]);

  const refresh = useCallback(() => {
    if (!clinicId) return Promise.resolve();
    return getBrowserApi()
      .pharmacy.listMedicines(clinicId)
      .then(setMedicines)
      .catch((caught) => toast(errorMessage(caught), "error"));
  }, [clinicId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const lowStock = (medicines ?? []).filter(isLowStock);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Stock</h1>
        <button
          aria-label="Add medicine"
          onClick={() => setAddOpen(true)}
          className="flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
        >
          <Plus className="size-5" />
        </button>
      </header>

      <div className="flex flex-col gap-3 px-5 py-3">
        {lowStock.length > 0 && (
          <Card className="flex items-start gap-3 border-warning/40 bg-warning/10">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div>
              <p className="font-semibold text-foreground">
                {lowStock.length} medicine{lowStock.length === 1 ? "" : "s"} running low
              </p>
              <p className="text-sm text-foreground-muted">
                {lowStock.map((medicine) => medicine.name).join(", ")}
              </p>
            </div>
          </Card>
        )}

        {medicines === null ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : medicines.length === 0 ? (
          <EmptyState
            icon={<Package className="size-8" />}
            title="No medicines yet"
            description="Add what the pharmacy carries so visits can be dispensed."
            action={<Button onClick={() => setAddOpen(true)}>Add medicine</Button>}
          />
        ) : (
          medicines.map((medicine) => (
            <Card key={medicine.id} className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate font-semibold text-foreground">{medicine.name}</p>
                <p className="text-sm text-foreground-muted">
                  {formatCurrency(medicine.unitPrice)} / {medicine.unit}
                </p>
                <p
                  className={
                    isLowStock(medicine)
                      ? "text-sm font-semibold text-warning"
                      : "text-sm text-foreground-muted"
                  }
                >
                  {medicine.stock} in stock
                  {isLowStock(medicine) ? " · low" : ""}
                </p>
              </div>
              <Button variant="secondary" onClick={() => setRestocking(medicine)}>
                Restock
              </Button>
            </Card>
          ))
        )}
      </div>

      {addOpen && clinicId && (
        <AddMedicineSheet
          clinicId={clinicId}
          onClose={() => setAddOpen(false)}
          onAdded={() => void refresh()}
        />
      )}

      {restocking && (
        <RestockSheet
          medicine={restocking}
          onClose={() => setRestocking(null)}
          onRestocked={() => void refresh()}
        />
      )}
    </div>
  );
}

function AddMedicineSheet({
  clinicId,
  onClose,
  onAdded,
}: {
  clinicId: UUID;
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await getBrowserApi().pharmacy.addMedicine({
        clinicId,
        name: name.trim(),
        unit: unit.trim(),
        unitPrice: parseAmount(price),
        initialStock: Math.max(0, Math.trunc(Number(stock) || 0)),
        lowStockThreshold: Math.max(0, Math.trunc(Number(threshold) || 0)),
      });
      toast(`${name.trim()} added`, "success");
      onAdded();
      onClose();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add medicine"
      footer={
        <Button
          fullWidth
          loading={busy}
          disabled={!name.trim() || !unit.trim()}
          onClick={() => void save()}
        >
          Add to stock
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Unit"
          value={unit}
          placeholder="tablet, ml, strip"
          onChange={(event) => setUnit(event.target.value)}
        />
        <TextField
          label="Price per unit"
          inputMode="decimal"
          placeholder="0"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
        <TextField
          label="Quantity in stock"
          inputMode="numeric"
          placeholder="0"
          value={stock}
          onChange={(event) => setStock(event.target.value)}
        />
        <TextField
          label="Warn below"
          inputMode="numeric"
          placeholder="0"
          hint="You'll see a low-stock warning at or below this quantity."
          value={threshold}
          onChange={(event) => setThreshold(event.target.value)}
        />
      </div>
    </Sheet>
  );
}

function RestockSheet({
  medicine,
  onClose,
  onRestocked,
}: {
  medicine: Medicine;
  onClose: () => void;
  onRestocked: () => void;
}) {
  const toast = useToast();
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);

  const amount = Math.max(0, Math.trunc(Number(quantity) || 0));

  async function save() {
    setBusy(true);
    try {
      const updated = await getBrowserApi().pharmacy.restock(medicine.id, amount);
      toast(`${medicine.name} now at ${updated.stock}`, "success");
      onRestocked();
      onClose();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Restock ${medicine.name}`}
      footer={
        <Button fullWidth loading={busy} disabled={amount <= 0} onClick={() => void save()}>
          Add {amount > 0 ? amount : ""} to stock
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground-muted">
          Currently {medicine.stock} {medicine.unit}
          {medicine.stock === 1 ? "" : "s"} in stock.
        </p>
        <TextField
          label="Quantity received"
          inputMode="numeric"
          placeholder="0"
          autoFocus
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </div>
    </Sheet>
  );
}
