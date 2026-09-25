"use client";

import { ChevronRight, Pencil, Plus, Stethoscope, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AddChildSheet } from "@/components/parent/add-child-sheet";
import { InstallAndNotifications } from "@/components/parent/install-and-notifications";
import { NotificationBell } from "@/components/parent/notification-bell";
import { ParentAuth } from "@/components/parent/parent-auth";
import { StickyActionBar } from "@/components/layout/nav-shell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { ParentShell } from "@/components/parent/parent-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { StatusPill } from "@/components/ui/status-pill";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import type { Child, ParentQueueEntry } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatAge, visitReasonLabels } from "@/lib/format";
import { useDefaultClinicId, useLiveRefresh } from "@/lib/realtime/use-live-refresh";

type Stage = "loading" | "signed-out" | "needs-name" | "ready";

const activeStatuses = new Set(["waiting", "called", "in_consultation"]);

type ParentState =
  | { stage: "signed-out" | "needs-name" }
  | { stage: "ready"; userId: string; children: Child[]; tokens: ParentQueueEntry[] };

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
    userId,
    children,
    tokens: queue.filter((entry) => activeStatuses.has(entry.status)),
  };
}

export default function ParentHome() {
  const [stage, setStage] = useState<Stage>("loading");
  const [children, setChildren] = useState<Child[]>([]);
  const [tokens, setTokens] = useState<ParentQueueEntry[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const bootstrap = useCallback(
    () =>
      loadParentState()
        .then((state) => {
          setLoadError(null);
          setStage(state.stage);
          if (state.stage === "ready") {
            setUserId(state.userId);
            setChildren(state.children);
            setTokens(state.tokens);
          }
        })
        // Offline or a server hiccup — not a reason to show the sign-in screen.
        .catch((caught) => setLoadError(errorMessage(caught))),
    []
  );

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Token cards follow the queue live: "now serving", position, being called.
  const clinicId = useDefaultClinicId(stage === "ready");
  useLiveRefresh("queue", clinicId, () =>
    getBrowserApi()
      .queue.getParentQueueView()
      .then((queue) => setTokens(queue.filter((entry) => activeStatuses.has(entry.status))))
      .catch(() => undefined)
  );

  if (loadError) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <ErrorState
          message={loadError}
          onRetry={() => {
            setLoadError(null);
            void bootstrap();
          }}
        />
      </div>
    );
  }

  if (stage === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 py-8">
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
    <ParentShell>
      <header className="flex items-center justify-between px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Pedi Clinic</h1>
        <div className="flex items-center">
        {userId && <NotificationBell userId={userId} />}
        <SignOutButton redirectTo="/" variant="icon" className="md:hidden" />
        </div>
      </header>

      <div className="px-5 py-2 empty:hidden">
        <InstallAndNotifications />
      </div>

      {tokens.length > 0 && (
        <section className="flex flex-col gap-3 px-5 py-3">
          <div className="contents @2xl:grid @2xl:grid-cols-2 @2xl:gap-3 @4xl:grid-cols-3">
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
          </div>
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
          <div className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
          {children.map((child) => (
            <ChildCard
              key={child.id}
              child={child}
              activeToken={tokens.find((token) => token.childId === child.id) ?? null}
              onEdit={() => setEditingChild(child)}
            />
          ))}
          </div>
        )}
      </section>

      {children.length > 0 ? (
        <StickyActionBar aboveNav tall>
          <KnowYourDoctorLink />
          <Link href="/check-in">
            <Button fullWidth variant="accent">
              Check in
            </Button>
          </Link>
        </StickyActionBar>
      ) : (
        <div className="px-5 pb-6">
          <KnowYourDoctorLink />
        </div>
      )}

      <AddChildSheet
        open={addChildOpen}
        onClose={() => setAddChildOpen(false)}
        onAdded={(child) => setChildren((current) => [...current, child])}
      />

      {editingChild && (
        <AddChildSheet
          key={editingChild.id}
          open
          child={editingChild}
          onClose={() => setEditingChild(null)}
          onChanged={() => void bootstrap()}
        />
      )}

    </ParentShell>
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
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-10"
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

/**
 * A child on Home: name and exact age, an edit button, and their own check-in
 * button — which reads "Currently in Queue" (and is disabled) while that child
 * is waiting, called or with the doctor.
 */
function ChildCard({
  child,
  activeToken,
  onEdit,
}: {
  child: Child;
  activeToken: ParentQueueEntry | null;
  onEdit: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{child.name}</p>
          <p className="text-sm text-foreground-muted">{formatAge(child.dob)}</p>
          {activeToken && (
            <p className="text-sm text-foreground-muted">
              Token {activeToken.seq} · {visitReasonLabels[activeToken.reason]}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={`Edit ${child.name}`}
          onClick={onEdit}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
        >
          <Pencil className="size-4" />
        </button>
      </div>
      {activeToken ? (
        <Button fullWidth variant="secondary" disabled>
          Currently in Queue
        </Button>
      ) : (
        <Link href={`/check-in?child=${child.id}`}>
          <Button fullWidth variant="secondary">
            Check in {child.name}
          </Button>
        </Link>
      )}
    </Card>
  );
}

/** Bottom-right of Home: the way into the doctor's profile. */
function KnowYourDoctorLink() {
  return (
    <div className="flex justify-end pb-2">
      <Link
        href="/doctor"
        className="flex min-h-10 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-primary-700 underline-offset-4 hover:underline dark:text-primary-300"
      >
        <Stethoscope aria-hidden className="size-4" />
        Know about your doctor
      </Link>
    </div>
  );
}
