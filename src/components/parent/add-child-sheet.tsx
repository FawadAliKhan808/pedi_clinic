"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import type { Child } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/format";

export function AddChildSheet({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (child: Child) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  async function save() {
    setBusy(true);
    try {
      const child = await getBrowserApi().parents.addChild({ name: name.trim(), dob });
      toast(`${child.name} added`, "success");
      onAdded(child);
      setName("");
      setDob("");
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
      title="Add child"
      footer={
        <Button
          fullWidth
          loading={busy}
          disabled={!name.trim() || !dob}
          onClick={() => void save()}
        >
          Save child
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
          hint="We use this to show your child's age to the doctor."
          onChange={(event) => setDob(event.target.value)}
        />
      </div>
    </Sheet>
  );
}
