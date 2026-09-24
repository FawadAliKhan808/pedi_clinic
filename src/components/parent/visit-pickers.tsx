"use client";

import { Check, Stethoscope, Syringe } from "lucide-react";
import type { ReactNode } from "react";
import { SelectableCard } from "@/components/ui/card";
import type { Child, VisitReason } from "@/lib/api";
import { formatAge } from "@/lib/format";

/**
 * The two choices a parent makes to join the queue — who, and why — shared
 * by check-in and booking so both flows look and feel the same.
 */

export const visitReasonOptions: { value: VisitReason; label: string; icon: typeof Syringe }[] = [
  { value: "general_checkup", label: "General checkup", icon: Stethoscope },
  { value: "vaccination", label: "Vaccination", icon: Syringe },
];

function PickerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 px-5 py-3 md:grid-cols-2">
      <h2 className="col-span-full text-sm font-semibold uppercase tracking-wide text-foreground-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ChildPicker({
  title,
  options,
  selectedId,
  onSelect,
}: {
  title: string;
  options: Child[];
  selectedId: string | null;
  onSelect: (childId: string) => void;
}) {
  return (
    <PickerSection title={title}>
      {options.map((child) => (
        <SelectableCard
          key={child.id}
          selected={selectedId === child.id}
          onSelect={() => onSelect(child.id)}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">{child.name}</p>
              <p className="text-sm text-foreground-muted">{formatAge(child.dob)}</p>
            </div>
            {selectedId === child.id && <Check className="size-5 text-primary-600" />}
          </div>
        </SelectableCard>
      ))}
    </PickerSection>
  );
}

export function ReasonPicker({
  selected,
  onSelect,
}: {
  selected: VisitReason | null;
  onSelect: (reason: VisitReason) => void;
}) {
  return (
    <PickerSection title="Reason for the visit">
      {visitReasonOptions.map(({ value, label, icon: Icon }) => (
        <SelectableCard key={value} selected={selected === value} onSelect={() => onSelect(value)}>
          <div className="flex items-center gap-3">
            <Icon className="size-5 text-primary-600" />
            <span className="font-semibold text-foreground">{label}</span>
            {selected === value && <Check className="ml-auto size-5 text-primary-600" />}
          </div>
        </SelectableCard>
      ))}
    </PickerSection>
  );
}
