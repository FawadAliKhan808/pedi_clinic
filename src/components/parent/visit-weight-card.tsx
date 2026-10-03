"use client";

import { Check, Scale } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { cn, errorMessage, formatWeight, parseWeightInput } from "@/lib/format";

/**
 * On the token screen, while the child waits: weigh them on the clinic's
 * scale and enter it here, so the doctor has it before they go in. Optional,
 * but asked for until it's done; it can be corrected until the visit ends.
 */
export function VisitWeightCard({
  visitId,
  childName,
  weightKg,
  onSaved,
}: {
  visitId: UUID;
  childName: string;
  weightKg: number | null;
  onSaved: (weightKg: number | null) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = parseWeightInput(text);
  const unreadable = text.trim() !== "" && parsed === null;
  const inputId = `weight-${visitId}`;

  async function save() {
    if (parsed === null) return;
    setBusy(true);
    try {
      const stored = await getBrowserApi().visits.recordWeight(visitId, parsed);
      onSaved(stored);
      setEditing(false);
      setText("");
      toast(`Weight saved — ${formatWeight(stored ?? parsed)}`, "success");
    } catch (caught) {
      toast(errorMessage(caught), "error");
    } finally {
      setBusy(false);
    }
  }

  if (weightKg !== null && !editing) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-surface-sunken px-4 py-3">
        <Check aria-hidden className="size-5 shrink-0 text-primary-600" />
        <p className="min-w-0 flex-1 text-sm text-foreground">
          Weight <strong className="tabular-nums">{formatWeight(weightKg)}</strong>
          <span className="text-foreground-muted"> · the doctor can see it</span>
        </p>
        <button
          type="button"
          onClick={() => {
            setText(String(weightKg));
            setEditing(true);
          }}
          className="min-h-10 shrink-0 rounded-full px-3 text-sm font-semibold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <form
      className={cn(
        "flex flex-col gap-3 rounded-xl border-2 p-4",
        weightKg === null
          ? "border-accent-300 bg-accent-50 dark:border-accent-800 dark:bg-accent-900/20"
          : "border-border"
      )}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex items-start gap-3">
        <Scale aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-600" />
        <div>
          <label htmlFor={inputId} className="font-semibold text-foreground">
            {weightKg === null ? `Weigh ${childName} while you wait` : `Correct ${childName}'s weight`}
          </label>
          <p className="text-sm text-foreground-muted">
            Use the scale at the clinic and enter the reading here, so the doctor has it.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 12.4"
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-invalid={unreadable}
            aria-describedby={unreadable ? `${inputId}-error` : undefined}
            className={cn(
              "min-h-12 w-full rounded-full border bg-surface-raised pl-4 pr-12 text-base tabular-nums text-foreground",
              "placeholder:text-neutral-400 focus:outline-2 focus:outline-offset-1 focus:outline-primary-500",
              unreadable ? "border-danger" : "border-border"
            )}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-foreground-muted">
            kg
          </span>
        </div>
        <Button type="submit" className="shrink-0 px-5" loading={busy} disabled={parsed === null}>
          Save
        </Button>
      </div>
      {unreadable && (
        <p id={`${inputId}-error`} className="text-sm text-danger">
          Enter the weight in kg, for example 12.4
        </p>
      )}
      {weightKg !== null && (
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="self-start text-sm font-semibold text-foreground-muted"
        >
          Keep {formatWeight(weightKg)}
        </button>
      )}
    </form>
  );
}
