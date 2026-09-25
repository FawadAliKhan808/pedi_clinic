"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectableCard } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import type { UUID, VisitReason } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  errorMessage,
  isValidPhone,
  normalizePhone,
  phoneError,
  todayISO,
  visitReasonLabels,
} from "@/lib/format";

const reasons: VisitReason[] = ["general_checkup", "vaccination"];

export function AddWalkInSheet({
  clinicId,
  open,
  onClose,
  onAdded,
}: {
  clinicId: UUID;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState<VisitReason>("general_checkup");
  const [busy, setBusy] = useState(false);

  const normalizedPhone = normalizePhone(phone);
  const dobInFuture = dob !== "" && dob > todayISO();
  const ready = name.trim() && dob && !dobInFuture && isValidPhone(phone);

  async function save() {
    if (!ready) return;
    setBusy(true);
    try {
      const visit = await getBrowserApi().queue.addWalkIn({
        clinicId,
        name: name.trim(),
        dob,
        parentPhone: normalizedPhone,
        visitReason: reason,
      });
      toast(`Token ${visit.seq} created for ${name.trim()}`, "success");
      setName("");
      setDob("");
      setPhone("");
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
      open={open}
      onClose={onClose}
      title="Add walk-in"
      footer={
        <Button fullWidth loading={busy} disabled={!ready} onClick={() => void save()}>
          Create token
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <TextField
          label="Child's name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Date of birth"
          type="date"
          max={todayISO()}
          value={dob}
          onChange={(event) => setDob(event.target.value)}
          error={dobInFuture ? "The date of birth can't be in the future." : undefined}
        />
        <TextField
          label="Parent's mobile number"
          type="tel"
          inputMode="numeric"
          maxLength={12}
          placeholder="10-digit mobile number"
          value={phone}
          hint="The visit links to this number and appears in their app when they sign in."
          error={phoneError(phone)}
          onChange={(event) => setPhone(event.target.value)}
        />

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground">Reason for the visit</p>
          {reasons.map((value) => (
            <SelectableCard
              key={value}
              selected={reason === value}
              onSelect={() => setReason(value)}
            >
              <span className="font-semibold text-foreground">
                {visitReasonLabels[value]}
              </span>
            </SelectableCard>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
