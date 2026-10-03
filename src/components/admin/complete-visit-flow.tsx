"use client";

import { Camera, Check, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, SelectableCard } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import type { PaymentMode, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  errorMessage,
  formatCurrency,
  parseAmount,
  paymentModeLabels,
  todayISO,
  formatWeight,
  parseWeightInput,
} from "@/lib/format";
import { compressImage } from "@/lib/image";

type Step = "photos" | "fees" | "payment" | "followup" | "review";
type PaymentChoice = PaymentMode | "hybrid";

const MAX_PHOTOS = 3;
const modes: PaymentMode[] = ["cash", "upi", "card"];

interface UploadedPhoto {
  storageKey: string;
  previewUrl: string;
}

export function CompleteVisitFlow({
  visitId,
  childName,
  initialWeightKg = null,
  open,
  onClose,
  onCompleted,
}: {
  visitId: UUID;
  childName: string;
  /** What the parent (or an earlier edit) already recorded for this visit. */
  initialWeightKg?: number | null;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);

  const [consultation, setConsultation] = useState("");
  const [vaccination, setVaccination] = useState("");
  const [other, setOther] = useState("");

  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice | null>(null);
  const [splits, setSplits] = useState<Record<PaymentMode, string>>({
    cash: "",
    upi: "",
    card: "",
  });

  // Starts empty for every consultation (the flow is keyed by visit).
  const [followUpDate, setFollowUpDate] = useState("");
  const [weightText, setWeightText] = useState(initialWeightKg === null ? "" : String(initialWeightKg));
  const weightKg = parseWeightInput(weightText);
  const weightUnreadable = weightText.trim() !== "" && weightKg === null;
  const [completing, setCompleting] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  // Anything the doctor has entered that closing would throw away.
  const hasUnsavedWork =
    photos.length > 0 ||
    consultation.trim() !== "" ||
    vaccination.trim() !== "" ||
    other.trim() !== "" ||
    paymentChoice !== null ||
    followUpDate !== "" ||
    weightKg !== initialWeightKg;

  /** Close, unless that would lose what's been entered — then ask first. */
  function requestClose() {
    if (completing) return;
    if (hasUnsavedWork) setConfirmingClose(true);
    else onClose();
  }

  const fees = {
    consultation: parseAmount(consultation),
    vaccination: parseAmount(vaccination),
    other: parseAmount(other),
  };
  const total = Math.round((fees.consultation + fees.vaccination + fees.other) * 100) / 100;

  const payments =
    paymentChoice === null
      ? []
      : paymentChoice === "hybrid"
        ? modes
            .map((mode) => ({ mode, amount: parseAmount(splits[mode]) }))
            .filter((entry) => entry.amount > 0)
        : [{ mode: paymentChoice, amount: total }];

  const paid = Math.round(payments.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100;
  const paymentBalances = total === 0 || paid === total;

  async function capturePhoto(file: File) {
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const storageKey = await getBrowserApi().storage.uploadPrescriptionImage(
        visitId,
        compressed,
        photos.length
      );
      setPhotos((current) => [
        ...current,
        { storageKey, previewUrl: URL.createObjectURL(compressed) },
      ]);
    } catch (caught) {
      toast(errorMessage(caught), "error");
    } finally {
      setUploading(false);
    }
  }

  async function discardPhoto(photo: UploadedPhoto) {
    setPhotos((current) => current.filter((item) => item !== photo));
    URL.revokeObjectURL(photo.previewUrl);
    try {
      await getBrowserApi().storage.removePrescriptionImage(photo.storageKey);
    } catch {
      // The row is never written, so a leftover object is harmless.
    }
  }

  async function complete() {
    setCompleting(true);
    try {
      // Saved first: once completed, the visit leaves the queue.
      if (weightKg !== initialWeightKg) {
        await getBrowserApi().visits.recordWeight(visitId, weightKg);
      }
      await getBrowserApi().visits.completeVisit({
        visitId,
        fees,
        payments,
        followUpDate: followUpDate || null,
        prescriptionStorageKeys: photos.map((photo) => photo.storageKey),
      });
      toast(`Visit completed for ${childName}`, "success");
      onCompleted();
      onClose();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    } finally {
      setCompleting(false);
    }
  }

  const steps: Record<Step, { title: string; body: React.ReactNode; footer: React.ReactNode }> = {
    photos: {
      title: "Prescription photo",
      body: (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground-muted">
            Photograph the prescription — up to {MAX_PHOTOS} pages.
          </p>

          {photos.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {photos.map((photo) => (
                <div key={photo.storageKey} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote asset */}
                  <img
                    src={photo.previewUrl}
                    alt="Prescription preview"
                    className="size-28 rounded-lg border border-border object-cover"
                  />
                  <button
                    onClick={() => void discardPhoto(photo)}
                    aria-label="Retake this photo"
                    className="absolute -right-2 -top-2 flex size-9 items-center justify-center rounded-full bg-danger text-neutral-0 shadow-md"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {photos.length < MAX_PHOTOS && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void capturePhoto(file);
                }}
              />
              <Button
                variant="secondary"
                fullWidth
                loading={uploading}
                onClick={() => fileInput.current?.click()}
              >
                <Camera className="size-5" />
                {photos.length === 0 ? "Take photo" : "Add another page"}
              </Button>
            </>
          )}
        </div>
      ),
      footer: (
        <Button fullWidth onClick={() => setStep("fees")}>
          {photos.length === 0 ? "Skip for now" : "Next"}
        </Button>
      ),
    },

    fees: {
      title: "Fees",
      body: (
        <div className="flex flex-col gap-5">
          <AmountField label="Consultation" value={consultation} onChange={setConsultation} />
          <AmountField label="Vaccination" value={vaccination} onChange={setVaccination} />
          <AmountField label="Other" value={other} onChange={setOther} />

          <Card className="flex items-center justify-between bg-surface-sunken">
            <span className="font-semibold text-foreground">Total</span>
            <span className="text-xl font-bold tabular-nums text-foreground">
              {formatCurrency(total)}
            </span>
          </Card>
        </div>
      ),
      footer: (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setStep("photos")}>
            Back
          </Button>
          <Button
            className="flex-1"
            onClick={() => setStep(total === 0 ? "followup" : "payment")}
          >
            Next
          </Button>
        </div>
      ),
    },

    payment: {
      title: "Payment",
      body: (
        <div className="flex flex-col gap-4">
          <Card className="flex items-center justify-between bg-surface-sunken">
            <span className="font-semibold text-foreground">Amount due</span>
            <span className="text-xl font-bold tabular-nums text-foreground">
              {formatCurrency(total)}
            </span>
          </Card>

          {modes.map((mode) => (
            <SelectableCard
              key={mode}
              selected={paymentChoice === mode}
              onSelect={() => setPaymentChoice(mode)}
            >
              <span className="font-semibold text-foreground">
                {paymentModeLabels[mode]}
              </span>
            </SelectableCard>
          ))}

          <SelectableCard
            selected={paymentChoice === "hybrid"}
            onSelect={() => setPaymentChoice("hybrid")}
          >
            <span className="font-semibold text-foreground">Split across modes</span>
          </SelectableCard>

          {paymentChoice === "hybrid" && (
            <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
              {modes.map((mode) => (
                <AmountField
                  key={mode}
                  label={paymentModeLabels[mode]}
                  value={splits[mode]}
                  onChange={(value) =>
                    setSplits((current) => ({ ...current, [mode]: value }))
                  }
                />
              ))}
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground-muted">Entered</span>
                <span
                  className={
                    paymentBalances
                      ? "font-semibold tabular-nums text-status-completed"
                      : "font-semibold tabular-nums text-danger"
                  }
                >
                  {formatCurrency(paid)} of {formatCurrency(total)}
                </span>
              </div>
            </div>
          )}
        </div>
      ),
      footer: (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setStep("fees")}>
            Back
          </Button>
          <Button
            className="flex-1"
            disabled={!paymentChoice || !paymentBalances}
            onClick={() => setStep("followup")}
          >
            Next
          </Button>
        </div>
      ),
    },

    followup: {
      title: "Weight and follow-up",
      body: (
        <div className="flex flex-col gap-4">
          <TextField
            label="Weight (kg)"
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 12.4"
            value={weightText}
            onChange={(event) => setWeightText(event.target.value)}
            error={weightUnreadable ? "Enter the weight in kg, for example 12.4" : undefined}
            hint={
              initialWeightKg !== null && weightKg === initialWeightKg
                ? "Entered by the parent from the clinic scale. Change it if it's wrong."
                : "Optional, but it builds the child's growth record."
            }
          />
          <p className="text-sm text-foreground-muted">
            Optional. The parent gets a reminder before this date — it does not book
            an appointment.
          </p>
          <TextField
            label="Follow-up date"
            type="date"
            min={todayISO()}
            value={followUpDate}
            onChange={(event) => setFollowUpDate(event.target.value)}
          />
          {followUpDate && (
            <Button variant="ghost" onClick={() => setFollowUpDate("")}>
              Clear date
            </Button>
          )}
        </div>
      ),
      footer: (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setStep(total === 0 ? "fees" : "payment")}
          >
            Back
          </Button>
          <Button className="flex-1" disabled={weightUnreadable} onClick={() => setStep("review")}>
            Review
          </Button>
        </div>
      ),
    },

    review: {
      title: "Review",
      body: (
        <div className="flex flex-col gap-3">
          <SummaryRow label="Child" value={childName} />
          <SummaryRow
            label="Prescription"
            value={photos.length === 0 ? "No photo" : `${photos.length} photo(s)`}
          />
          {fees.consultation > 0 && (
            <SummaryRow label="Consultation" value={formatCurrency(fees.consultation)} />
          )}
          {fees.vaccination > 0 && (
            <SummaryRow label="Vaccination" value={formatCurrency(fees.vaccination)} />
          )}
          {fees.other > 0 && <SummaryRow label="Other" value={formatCurrency(fees.other)} />}

          <Card className="flex items-center justify-between bg-surface-sunken">
            <span className="font-semibold text-foreground">Total</span>
            <span className="text-xl font-bold tabular-nums text-foreground">
              {formatCurrency(total)}
            </span>
          </Card>

          {payments.map((entry) => (
            <SummaryRow
              key={entry.mode}
              label={paymentModeLabels[entry.mode]}
              value={formatCurrency(entry.amount)}
            />
          ))}
          {total === 0 && <SummaryRow label="Payment" value="No payment due" />}

          <SummaryRow label="Weight" value={weightKg === null ? "Not recorded" : formatWeight(weightKg)} />
          <SummaryRow
            label="Follow-up"
            value={followUpDate ? followUpDate : "None"}
          />
        </div>
      ),
      footer: (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setStep("followup")}>
            Back
          </Button>
          <Button
            className="flex-1"
            variant="accent"
            loading={completing}
            onClick={() => void complete()}
          >
            <Check className="size-5" />
            Complete visit
          </Button>
        </div>
      ),
    },
  };

  const current = steps[step];

  return (
    <>
      <Sheet open={open} onClose={requestClose} title={current.title} footer={current.footer}>
        {current.body}
      </Sheet>
      {confirmingClose && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-900/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-title"
            className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface-raised p-6 shadow-2xl"
          >
            <h2 id="discard-title" className="text-lg font-bold text-foreground">
              Are you sure? Unsaved data will be lost.
            </h2>
            <p className="text-sm text-foreground-muted">
              The prescription, amounts and follow-up you&apos;ve entered for {childName} will
              be discarded. The visit stays open in the queue.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button className="flex-1" autoFocus onClick={() => setConfirmingClose(false)}>
                Keep editing
              </Button>
              <Button
                className="flex-1"
                variant="danger"
                onClick={() => {
                  setConfirmingClose(false);
                  // Photos already uploaded aren't attached to the visit; tidy them up.
                  for (const photo of photos) void discardPhoto(photo);
                  onClose();
                }}
              >
                Discard and close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AmountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      label={label}
      inputMode="decimal"
      placeholder="0"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2">
      <span className="text-foreground-muted">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
