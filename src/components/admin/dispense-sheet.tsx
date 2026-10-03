"use client";

import { Minus, Plus, Scale, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Spinner } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { PrescriptionThumbs } from "@/components/visits/prescription-photos";
import { isLowStock, type Medicine, type PharmacyFeedEntry, type UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatCurrency, formatWeight } from "@/lib/format";
import { lastShown, useRememberShown } from "@/lib/last-shown";

export function DispenseSheet({
  clinicId,
  entry,
  onClose,
  onDispensed,
}: {
  clinicId: UUID;
  entry: PharmacyFeedEntry;
  onClose: () => void;
  onDispensed: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  // Opens with the list the Stock screen (or the last dispense) already has, then refreshes.
  const [medicines, setMedicines] = useState<Medicine[] | null>(
    () => lastShown<Medicine[]>("pharmacy-medicines") ?? null
  );
  useRememberShown("pharmacy-medicines", medicines);
  const [quantities, setQuantities] = useState<Record<UUID, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBrowserApi()
      .pharmacy.listMedicines(clinicId)
      .then((list) => {
        if (!cancelled) setMedicines(list);
      })
      .catch((caught) => toast(errorMessage(caught), "error"));

    return () => {
      cancelled = true;
    };
  }, [clinicId, toast]);

  const trimmed = query.trim().toLowerCase();
  const visible = (medicines ?? []).filter(
    (medicine) =>
      !trimmed ||
      medicine.name.toLowerCase().includes(trimmed) ||
      quantities[medicine.id] > 0
  );

  const picked = (medicines ?? []).filter((medicine) => quantities[medicine.id] > 0);
  const total = picked.reduce(
    (sum, medicine) => sum + medicine.unitPrice * quantities[medicine.id],
    0
  );

  function setQuantity(medicine: Medicine, next: number) {
    const clamped = Math.max(0, Math.min(next, medicine.stock));
    setQuantities((current) => ({ ...current, [medicine.id]: clamped }));
  }

  async function dispense() {
    setBusy(true);
    try {
      const order = await getBrowserApi().pharmacy.dispense({
        visitId: entry.visitId,
        items: picked.map((medicine) => ({
          medicineId: medicine.id,
          quantity: quantities[medicine.id],
        })),
      });
      toast(`Dispensed — ${formatCurrency(order.total)}`, "success");
      onDispensed();
      onClose();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await getBrowserApi().pharmacy.skipOrder(entry.visitId);
      toast(`Token ${entry.seq} cleared`, "info");
      onDispensed();
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
      title={`Token ${entry.seq} · ${entry.childName}`}
      footer={
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm text-foreground-muted">
              {picked.length} item{picked.length === 1 ? "" : "s"}
            </span>
            <span className="text-lg font-bold tabular-nums text-foreground">
              {formatCurrency(total)}
            </span>
          </div>
          <Button
            fullWidth
            loading={busy}
            disabled={picked.length === 0}
            onClick={() => void dispense()}
          >
            Dispense
          </Button>
          <Button variant="ghost" fullWidth onClick={() => void skip()}>
            Buying elsewhere — skip
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 rounded-xl bg-surface-sunken px-4 py-3 text-sm">
          <Scale aria-hidden className="size-4 shrink-0 text-primary-600" />
          {entry.weightKg !== null ? (
            <span className="text-foreground">
              Weight at this visit{" "}
              <strong className="tabular-nums">{formatWeight(entry.weightKg)}</strong>
            </span>
          ) : (
            <span className="text-foreground-muted">No weight recorded at this visit</span>
          )}
        </div>

        {entry.storageKeys.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
              Prescription
            </h3>
            <PrescriptionThumbs storageKeys={entry.storageKeys} />
          </section>
        )}

        <TextField
          label="Find a medicine"
          value={query}
          placeholder="Start typing a name"
          onChange={(event) => setQuery(event.target.value)}
        />

        {medicines === null ? (
          <div className="flex justify-center py-6 text-foreground-muted">
            <Spinner />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Search className="size-8" />}
            title={medicines.length === 0 ? "No medicines yet" : "No matches"}
            description={
              medicines.length === 0
                ? "Add stock from the Stock tab before dispensing."
                : "Try a different spelling."
            }
          />
        ) : (
          visible.map((medicine) => {
            const quantity = quantities[medicine.id] ?? 0;
            return (
              <Card key={medicine.id} className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate font-semibold text-foreground">
                    {medicine.name}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {formatCurrency(medicine.unitPrice)} / {medicine.unit} ·{" "}
                    <span
                      className={
                        isLowStock(medicine) ? "font-semibold text-warning" : ""
                      }
                    >
                      {medicine.stock} left
                    </span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    aria-label={`Remove one ${medicine.name}`}
                    disabled={quantity === 0}
                    onClick={() => setQuantity(medicine, quantity - 1)}
                    className="flex size-11 items-center justify-center rounded-lg border border-border text-foreground disabled:opacity-40"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-8 text-center font-semibold tabular-nums text-foreground">
                    {quantity}
                  </span>
                  <button
                    aria-label={`Add one ${medicine.name}`}
                    disabled={quantity >= medicine.stock}
                    onClick={() => setQuantity(medicine, quantity + 1)}
                    className="flex size-11 items-center justify-center rounded-lg border border-border text-foreground disabled:opacity-40"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </Sheet>
  );
}
