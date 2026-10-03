"use client";

import { ChevronRight, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { brand } from "@/brand";
import { AddChildSheet } from "@/components/parent/add-child-sheet";
import { InstallAndNotifications } from "@/components/parent/install-and-notifications";
import { NotificationBell } from "@/components/parent/notification-bell";
import { NotificationBanner } from "@/components/parent/notification-permission-prompt";
import { ParentAuth } from "@/components/parent/parent-auth";
import { StickyActionBar } from "@/components/layout/nav-shell";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { ParentShell } from "@/components/parent/parent-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { StatusPill } from "@/components/ui/status-pill";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import type { Child, ParentQueueEntry } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { cn, errorMessage, formatAge, visitReasonLabels } from "@/lib/format";
import { forgetShown, lastShown, useRememberShown } from "@/lib/last-shown";
import { useDefaultClinicId, useLiveRefresh } from "@/lib/realtime/use-live-refresh";

type Stage = "loading" | "signed-out" | "needs-name" | "ready";

const activeStatuses = new Set(["waiting", "called", "in_consultation"]);

type ParentState =
  | { stage: "signed-out" | "needs-name" }
  | { stage: "ready"; userId: string; name: string; children: Child[]; tokens: ParentQueueEntry[] };

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
    name: profile.name,
    children,
    tokens: queue.filter((entry) => activeStatuses.has(entry.status)),
  };
}

interface HomeShown {
  userId: string;
  name: string;
  children: Child[];
  tokens: ParentQueueEntry[];
}

export default function ParentHome() {
  // Coming back to Home shows the last children and tokens at once; bootstrap refreshes them.
  const [shownBefore] = useState(() => lastShown<HomeShown>("parent-home"));
  const [stage, setStage] = useState<Stage>(shownBefore ? "ready" : "loading");
  const [children, setChildren] = useState<Child[]>(shownBefore?.children ?? []);
  const [tokens, setTokens] = useState<ParentQueueEntry[]>(shownBefore?.tokens ?? []);
  const [userId, setUserId] = useState<string | null>(shownBefore?.userId ?? null);
  const [parentName, setParentName] = useState(shownBefore?.name ?? "");
  const homeShown = useMemo(
    () => (stage === "ready" && userId ? { userId, name: parentName, children, tokens } : null),
    [stage, userId, parentName, children, tokens]
  );
  useRememberShown("parent-home", homeShown);
  const [addChildOpen, setAddChildOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const bootstrap = useCallback(
    () =>
      loadParentState()
        .then((state) => {
          setLoadError(null);
          setStage(state.stage);
          if (state.stage === "ready") {
            setUserId(state.userId);
            setParentName(state.name);
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
    return (
      <ParentAuth
        onSignedIn={() => {
          forgetShown();
          void bootstrap();
        }}
      />
    );
  }

  if (stage === "needs-name") {
    return <NameStep onSaved={() => void bootstrap()} />;
  }

  return (
    <ParentShell>
      <header className="flex items-center justify-between px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="truncate text-2xl font-bold text-foreground">{brand.name}</h1>
        <div className="flex items-center">
        {userId && <NotificationBell userId={userId} />}
        <SignOutButton redirectTo="/" variant="icon" className="md:hidden" />
        </div>
      </header>

      {/* First things first: until a child is added, nothing competes with that step. */}
      {children.length > 0 && (
        <div className="px-5 py-2 empty:hidden">
          <InstallAndNotifications />
        </div>
      )}

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
          {children.length > 0 && (
            <button
              onClick={() => setAddChildOpen(true)}
              className="flex min-h-12 items-center gap-1.5 rounded-lg px-2 font-semibold text-primary-600"
            >
              <Plus className="size-4" />
              Add child
            </button>
          )}
        </div>

        {children.length === 0 ? (
          <FirstChildWelcome name={parentName} />
        ) : (
          <div className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
          {children.map((child) => (
            <ChildCard
              key={child.id}
              child={child}
              activeToken={tokens.find((token) => token.childId === child.id) ?? null}
            />
          ))}
          </div>
        )}
      </section>

      {/* Bottom dock: the notifications banner (only while undecided), then
          Check in. Pinned to the bottom on every screen size. The doctor's
          profile is under More. */}
      <StickyActionBar aboveNav>
        {children.length > 0 ? (
          <>
            <NotificationBanner placement="dock" />
            <Link href="/check-in">
              <Button fullWidth variant="accent" className="min-h-14 text-lg">
                Check in
              </Button>
            </Link>
          </>
        ) : (
          <Button
            fullWidth
            variant="accent"
            className="min-h-14 text-lg"
            onClick={() => setAddChildOpen(true)}
          >
            <Plus className="size-5" />
            Add your child
          </Button>
        )}
      </StickyActionBar>

      <AddChildSheet
        open={addChildOpen}
        onClose={() => setAddChildOpen(false)}
        onAdded={(child) => setChildren((current) => [...current, child])}
      />

    </ParentShell>
  );
}

/**
 * Home before any child is added: a welcome by name and the one next step,
 * with what it unlocks. The step's button is the bottom dock's main action.
 */
function FirstChildWelcome({ name }: { name: string }) {
  const steps = [
    "Add your child's name and date of birth",
    "Check in at the clinic and get a token",
    "Follow the queue live and get an alert when it's your turn",
  ];
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
          <UserRound className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-foreground">
            {name ? `Welcome, ${name.split(" ")[0]}` : "Welcome"}
          </p>
          <p className="text-sm text-foreground-muted">Let&apos;s get your child set up.</p>
        </div>
      </div>
      <ol className="flex flex-col gap-2.5">
        {steps.map((step, index) => (
          <li key={step} className="flex items-start gap-3 text-sm">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                index === 0
                  ? "bg-accent-500 text-foreground-on-accent"
                  : "bg-surface-sunken text-foreground-muted"
              )}
            >
              {index + 1}
            </span>
            <span className={index === 0 ? "font-semibold text-foreground" : "text-foreground-muted"}>
              {step}
            </span>
          </li>
        ))}
      </ol>
    </Card>
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
 * A child on Home: name, exact age and — while they're waiting, called or
 * with the doctor — a "Currently in queue" label. Tapping opens the child's
 * own screen (visits, bookings, edit details). Checking in is the main
 * button in the bottom dock.
 */
function ChildCard({ child, activeToken }: { child: Child; activeToken: ParentQueueEntry | null }) {
  return (
    <Link href={`/children/${child.id}`} prefetch className="block">
      <Card className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-100 font-display text-lg font-bold text-primary-800 dark:bg-primary-900/40 dark:text-primary-200"
        >
          {child.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{child.name}</p>
          <p className="text-sm text-foreground-muted">{formatAge(child.dob)}</p>
          {activeToken && (
            <p className="text-sm text-foreground-muted">
              Token {activeToken.seq} · {visitReasonLabels[activeToken.reason]}
            </p>
          )}
          {activeToken && (
            <span className="mt-1.5 inline-block rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800 dark:bg-primary-900/30 dark:text-primary-200">
              Currently in queue
            </span>
          )}
        </div>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-foreground-muted" />
      </Card>
    </Link>
  );
}
