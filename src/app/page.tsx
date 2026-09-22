"use client";

import { ChevronRight, LogOut, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AddChildSheet } from "@/components/parent/add-child-sheet";
import { ParentAuth } from "@/components/parent/parent-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { StatusPill } from "@/components/ui/status-pill";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import type { Child, ParentQueueEntry } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatAge, visitReasonLabels } from "@/lib/format";

type Stage = "loading" | "signed-out" | "needs-name" | "ready";

const activeStatuses = new Set(["waiting", "called", "in_consultation"]);

type ParentState =
  | { stage: "signed-out" | "needs-name" }
  | { stage: "ready"; children: Child[]; tokens: ParentQueueEntry[] };

async function loadParentState(): Promise<ParentState> {
  const api = getBrowserApi();
  const userId = await api.auth.getCurrentUserId();
  if (!userId) return { stage: "signed-out" };

  // Claims any walk-in record the doctor created against this phone number.
  const profile = await api.parents.ensureProfile();
  if (!profile.name) return { stage: "needs-name" };

  const [children, queue] = await Promise.all([
    api.parents.listMyChildren(),
    api.queue.getParentQueueView(),
  ]);

  return {
    stage: "ready",
    children,
    tokens: queue.filter((entry) => activeStatuses.has(entry.status)),
  };
}

export default function ParentHome() {
  const toast = useToast();
  const [stage, setStage] = useState<Stage>("loading");
  const [children, setChildren] = useState<Child[]>([]);
  const [tokens, setTokens] = useState<ParentQueueEntry[]>([]);
  const [addChildOpen, setAddChildOpen] = useState(false);

  const bootstrap = useCallback(
    () =>
      loadParentState()
        .then((state) => {
          setStage(state.stage);
          if (state.stage === "ready") {
            setChildren(state.children);
            setTokens(state.tokens);
          }
        })
        .catch((caught) => {
          toast(errorMessage(caught), "error");
          setStage("signed-out");
        }),
    [toast]
  );

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (stage === "loading") {
    return (
      <div className="flex flex-1 flex-col gap-4 px-5 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (stage === "signed-out") {
    return <ParentAuth onSignedIn={() => void bootstrap()} />;
  }

  if (stage === "needs-name") {
    return <NameStep onSaved={() => void bootstrap()} />;
  }

  return (
    <div className="flex flex-1 flex-col pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Pedi Clinic</h1>
        <button
          aria-label="Sign out"
          onClick={async () => {
            await getBrowserApi().auth.signOut();
            setStage("signed-out");
          }}
          className="flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
        >
          <LogOut className="size-5" />
        </button>
      </header>

      {tokens.length > 0 && (
        <section className="flex flex-col gap-3 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
            Today&apos;s tokens
          </h2>
          {tokens.map((token) => (
            <Link key={token.visitId} href="/queue" className="block">
              <Card className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-600 text-foreground-on-primary">
                  <span className="text-2xl font-bold leading-none">{token.seq}</span>
                  <span className="text-[10px] font-semibold uppercase">Token</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate font-semibold text-foreground">
                    {token.childName}
                  </p>
                  <StatusPill status={token.status} className="self-start" />
                </div>
                <ChevronRight className="size-5 shrink-0 text-foreground-muted" />
              </Card>
            </Link>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3 px-5 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
            Your children
          </h2>
          <button
            onClick={() => setAddChildOpen(true)}
            className="flex min-h-12 items-center gap-1.5 rounded-lg px-2 font-semibold text-primary-600"
          >
            <Plus className="size-4" />
            Add child
          </button>
        </div>

        {children.length === 0 ? (
          <EmptyState
            icon={<UserRound className="size-8" />}
            title="No children added yet"
            description="Add your child's name and date of birth to check in."
            action={
              <Button onClick={() => setAddChildOpen(true)}>Add your first child</Button>
            }
          />
        ) : (
          children.map((child) => (
            <Card key={child.id} className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{child.name}</p>
                <p className="text-sm text-foreground-muted">{formatAge(child.dob)}</p>
              </div>
              {tokens.some((token) => token.childId === child.id) && (
                <span className="text-sm text-foreground-muted">
                  {
                    visitReasonLabels[
                      tokens.find((token) => token.childId === child.id)!.reason
                    ]
                  }
                </span>
              )}
            </Card>
          ))
        )}
      </section>

      {children.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-surface px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Link href="/check-in">
            <Button fullWidth variant="accent">
              Check in
            </Button>
          </Link>
        </div>
      )}

      <AddChildSheet
        open={addChildOpen}
        onClose={() => setAddChildOpen(false)}
        onAdded={(child) => setChildren((current) => [...current, child])}
      />
    </div>
  );
}

function NameStep({ onSaved }: { onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await getBrowserApi().parents.completeProfile({ name: name.trim() });
      onSaved();
    } catch (caught) {
      toast(errorMessage(caught), "error");
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-1 flex-col justify-center gap-6 px-6 py-10"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">What should we call you?</h1>
        <p className="text-foreground-muted">
          The doctor sees this alongside your child&apos;s details.
        </p>
      </div>
      <TextField
        label="Your name"
        value={name}
        autoComplete="name"
        onChange={(event) => setName(event.target.value)}
      />
      <Button type="submit" fullWidth loading={busy} disabled={!name.trim()}>
        Continue
      </Button>
    </form>
  );
}
