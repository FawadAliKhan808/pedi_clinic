"use client";

import { AlertTriangle, Package, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { isLowStock, type Medicine, type UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { cn, errorMessage, formatCurrency, parseAmount } from "@/lib/format";
import { lastShown, useRememberShown } from "@/lib/last-shown";
import { useLiveRefresh } from "@/lib/realtime/use-live-refresh";

type StockFilter = "all" | "in_stock" | "low" | "out";

function stockStatus(medicine: Medicine): Exclude<StockFilter, "all"> {
  if (medicine.stock <= 0) return "out";
  return isLowStock(medicine) ? "low" : "in_stock";
}

// Out of stock first, then low, then the rest — what needs attention on top.
const statusOrder: Record<Exclude<StockFilter, "all">, number> = { out: 0, low: 1, in_stock: 2 };

export default function StockPage() {
  const toast = useToast();
  // Coming back to Stock shows the last list at once while a fresh copy loads.
  const [clinicId, setClinicId] = useState<UUID | null>(() => lastShown<UUID>("staff-clinic") ?? null);
  const [medicines, setMedicines] = useState<Medicine[] | null>(
    () => lastShown<Medicine[]>("pharmacy-medicines") ?? null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [restocking, setRestocking] = useState<Medicine | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  useRememberShown("staff-clinic", clinicId);
  useRememberShown("pharmacy-medicines", medicines);

  useEffect(() => {
    getBrowserApi()
      .auth.getStaffRole()
      .then((staff) => setClinicId(staff?.clinicId ?? null))
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [toast]);

  const refresh = useCallback(() => {
    if (!clinicId) return Promise.resolve();
    return getBrowserApi()
      .pharmacy.listMedicines(clinicId)
      .then(setMedicines)
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [clinicId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Dispensing on another device changes the counts; follow it.
  useLiveRefresh("pharmacy", clinicId, refresh);

  const lowStock = (medicines ?? []).filter(isLowStock);

  const counts = { all: 0, in_stock: 0, low: 0, out: 0 };
  for (const medicine of medicines ?? []) {
    counts.all += 1;
    counts[stockStatus(medicine)] += 1;
  }
  const needle = query.trim().toLowerCase();
  const shown = (medicines ?? [])
    .filter(
      (medicine) =>
        (filter === "all" || stockStatus(medicine) === filter) &&
        (!needle || medicine.name.toLowerCase().includes(needle))
    )
    .sort(
      (a, b) =>
        statusOrder[stockStatus(a)] - statusOrder[stockStatus(b)] || a.name.localeCompare(b.name)
    );

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

      {medicines && medicines.length > 0 && (
        <div className="flex flex-col gap-2 px-5 pt-1">
          <div className="relative max-w-xl">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-foreground-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search medicines"
              aria-label="Search medicines by name"
              className="min-h-12 w-full rounded-full border border-border bg-surface-raised pl-11 pr-11 text-base text-foreground placeholder:text-neutral-400 focus:outline-2 focus:outline-offset-1 focus:outline-primary-500"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div
            role="group"
            aria-label="Filter by stock"
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1"
          >
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")} count={counts.all}>
              All
            </FilterChip>
            <FilterChip
              active={filter === "in_stock"}
              onClick={() => setFilter("in_stock")}
              count={counts.in_stock}
            >
              In stock
            </FilterChip>
            <FilterChip
              active={filter === "low"}
              onClick={() => setFilter("low")}
              count={counts.low}
              tone="warning"
            >
              Low stock
            </FilterChip>
            <FilterChip
              active={filter === "out"}
              onClick={() => setFilter("out")}
              count={counts.out}
              tone="danger"
            >
              Out of stock
            </FilterChip>
          </div>
        </div>
      )}

      <div className="grid gap-3 px-5 py-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
        {lowStock.length > 0 && filter === "all" && !needle && (
          <Card className="col-span-full flex items-start gap-3 border-warning/40 bg-warning/10">
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

        {medicines === null && loadError ? (
          <div className="col-span-full">
            <ErrorState message={loadError} onRetry={() => window.location.reload()} />
          </div>
        ) : medicines === null ? (
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
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<Search className="size-8" />}
            title="No medicines match"
            description={needle ? `Nothing called "${query.trim()}" here.` : "None in this group right now."}
            action={
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="min-h-12 rounded-lg px-4 font-semibold text-primary-600"
              >
                Show all medicines
              </button>
            }
          />
        ) : (
          shown.map((medicine) => (
            <Card key={medicine.id} className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="truncate font-semibold text-foreground">{medicine.name}</p>
                <p className="text-sm text-foreground-muted">
                  {formatCurrency(medicine.unitPrice)} / {medicine.unit}
                </p>
                <p
                  className={cn(
                    "text-sm",
                    stockStatus(medicine) === "out"
                      ? "font-semibold text-danger"
                      : stockStatus(medicine) === "low"
                        ? "font-semibold text-warning"
                        : "text-foreground-muted"
                  )}
                >
                  {stockStatus(medicine) === "out"
                    ? "Out of stock"
                    : `${medicine.stock} in stock${stockStatus(medicine) === "low" ? " · low" : ""}`}
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

function FilterChip({
  active,
  onClick,
  count,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  tone?: "warning" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors",
        active
          ? "border-primary-600 bg-primary-600 text-foreground-on-primary"
          : "border-border bg-surface text-foreground hover:bg-surface-sunken"
      )}
    >
      {children}
      <span
        className={cn(
          "min-w-6 rounded-full px-1.5 text-xs font-bold tabular-nums leading-6",
          active
            ? "bg-white/20"
            : tone === "danger" && count > 0
              ? "bg-danger/15 text-danger"
              : tone === "warning" && count > 0
                ? "bg-warning/20 text-foreground"
                : "bg-surface-sunken text-foreground-muted"
        )}
      >
        {count}
      </span>
    </button>
  );
}
