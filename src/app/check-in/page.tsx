"use client";

import { ArrowLeft, Check, Stethoscope, Syringe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StickyActionBar } from "@/components/layout/nav-shell";
import { Button } from "@/components/ui/button";
import { SelectableCard } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { Child, VisitReason } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatAge } from "@/lib/format";
import { sessionFlag, SHOW_INSTALL_AFTER_TOKEN } from "@/lib/pwa/environment";

const reasons: { value: VisitReason; label: string; icon: typeof Syringe }[] = [
  { value: "general_checkup", label: "General checkup", icon: Stethoscope },
  { value: "vaccination", label: "Vaccination", icon: Syringe },
];

export default function CheckInPage() {
  const router = useRouter();
  const toast = useToast();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [reason, setReason] = useState<VisitReason | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const api = getBrowserApi();
      const userId = await api.auth.getCurrentUserId();
      if (!userId) {
        router.replace("/");
        return;
      }
      const list = await api.parents.listMyChildren();
      setChildren(list);
      if (list.length === 1) setChildId(list[0].id);
    })().catch((caught) => toast(errorMessage(caught), "error"));
  }, [router, toast]);

  async function getToken() {
    if (!childId || !reason) return;
    setBusy(true);
    try {
      const api = getBrowserApi();
      await api.queue.checkIn({ childId, visitReason: reason });
      // A new token can put this child 3rd in line straight away.
      void api.notifications.dispatchPending();
      // The brief asks for the install popup again right after a token.
      sessionFlag.set(SHOW_INSTALL_AFTER_TOKEN, true);
      router.replace("/queue");
    } catch (caught) {
      toast(errorMessage(caught), "error");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <header className="flex items-center gap-2 px-3 pb-2 pt-[calc(1rem+env(safe-area-inset-top))]">
        <button
          aria-label="Back"
          onClick={() => router.back()}
          className="flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Check in</h1>
      </header>

      <section className="grid gap-3 px-5 py-3 md:grid-cols-2">
        <h2 className="col-span-full text-sm font-semibold uppercase tracking-wide text-foreground-muted">
          Who is visiting?
        </h2>
        {children === null ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : (
          children.map((child) => (
            <SelectableCard
              key={child.id}
              selected={childId === child.id}
              onSelect={() => setChildId(child.id)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">{child.name}</p>
                  <p className="text-sm text-foreground-muted">{formatAge(child.dob)}</p>
                </div>
                {childId === child.id && <Check className="size-5 text-primary-600" />}
              </div>
            </SelectableCard>
          ))
        )}
      </section>

      <section className="grid gap-3 px-5 py-3 md:grid-cols-2">
        <h2 className="col-span-full text-sm font-semibold uppercase tracking-wide text-foreground-muted">
          Reason for the visit
        </h2>
        {reasons.map(({ value, label, icon: Icon }) => (
          <SelectableCard
            key={value}
            selected={reason === value}
            onSelect={() => setReason(value)}
          >
            <div className="flex items-center gap-3">
              <Icon className="size-5 text-primary-600" />
              <span className="font-semibold text-foreground">{label}</span>
              {reason === value && (
                <Check className="ml-auto size-5 text-primary-600" />
              )}
            </div>
          </SelectableCard>
        ))}
      </section>

      <StickyActionBar>
        <Button
          fullWidth
          variant="accent"
          loading={busy}
          disabled={!childId || !reason}
          onClick={() => void getToken()}
        >
          Get token
        </Button>
      </StickyActionBar>
    </div>
  );
}
