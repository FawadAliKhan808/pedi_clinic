"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import type { Child } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatAge, todayISO } from "@/lib/format";

/**
 * Add a child, or — given `child` — edit their name and date of birth, or
 * delete them if they were added by mistake. Dates of birth can't be in the
 * future (the picker stops at today and the server refuses one anyway).
 * Mount with a `key` per child so the form starts from that child's details.
 */
export function AddChildSheet({
  open,
  onClose,
  onAdded,
  child,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onAdded?: (child: Child) => void;
  /** Editing this child instead of adding one. */
  child?: Child;
  /** After an edit or a delete. */
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(child?.name ?? "");
  const [dob, setDob] = useState(child?.dob ?? "");
  const [busy, setBusy] = useState(false);

  const today = todayISO();
  const dobInFuture = dob !== "" && dob > today;
  const unchanged = child !== undefined && name.trim() === child.name && dob === child.dob;
  const ready = name.trim() !== "" && dob !== "" && !dobInFuture && !unchanged;

  async function save() {
    if (!ready) return;
    setBusy(true);
    try {
      const api = getBrowserApi().parents;
      if (child) {
        const updated = await api.updateChild(child.id, { name: name.trim(), dob });
        toast(`${updated.name}'s details saved`, "success");
        onChanged?.();
      } else {
        const added = await api.addChild({ name: name.trim(), dob });
        toast(`${added.name} added`, "success");
        onAdded?.(added);
        setName("");
        setDob("");
      }
      onClose();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!child) return;
    try {
      await getBrowserApi().parents.deleteChild(child.id);
      toast(`${child.name} removed`, "success");
      onChanged?.();
      onClose();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={child ? `Edit ${child.name}` : "Add child"}
      footer={
        <Button fullWidth loading={busy} disabled={!ready} onClick={() => void save()}>
          {child ? "Save changes" : "Save child"}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <TextField
          label="Child's name"
          value={name}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Date of birth"
          type="date"
          max={today}
          value={dob}
          hint={
            dob && !dobInFuture
              ? `Age today: ${formatAge(dob)}`
              : "We use this to show your child's exact age to the doctor."
          }
          error={dobInFuture ? "The date of birth can't be in the future." : undefined}
          onChange={(event) => setDob(event.target.value)}
        />

        {child && (
          <div className="flex flex-col gap-2 border-t border-border pt-5">
            <p className="text-sm text-foreground-muted">
              Added by mistake? Deleting removes {child.name} and any upcoming bookings. A
              child who has already visited the clinic keeps their records and can&apos;t be
              deleted.
            </p>
            <ConfirmButton
              label={`Delete ${child.name}`}
              confirmLabel={`Tap again to delete ${child.name}`}
              onConfirm={() => remove()}
            />
          </div>
        )}
      </div>
    </Sheet>
  );
}
