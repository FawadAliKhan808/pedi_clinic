"use client";

import { LogOut, Stethoscope, UserRound } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSignOut } from "@/components/layout/sign-out-button";
import { ParentShell } from "@/components/parent/parent-shell";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { MenuRow, MenuSection } from "@/components/ui/menu-list";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import type { DoctorProfile } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatPhone } from "@/lib/format";

/**
 * The parents' More tab, like the staff app's: the doctor (opens the full
 * profile) and the account.
 */
export default function ParentMorePage() {
  const router = useRouter();
  const { signOut, busy: signingOut } = useSignOut("/");
  const [data, setData] = useState<{
    profile: DoctorProfile | null;
    phone: string | null;
    name: string | null;
  } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const api = getBrowserApi();
      if (!(await api.auth.getCurrentUserId())) {
        router.replace("/");
        return;
      }
      const [profile, phone, me] = await Promise.all([
        api.clinic.getDoctorProfile(),
        api.auth.getCurrentPhone(),
        api.parents.getMyProfile(),
      ]);
      if (!cancelled) setData({ profile, phone, name: me?.name ?? null });
    })().catch((caught) => {
      if (!cancelled) setLoadError(errorMessage(caught));
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Stored as digits — bare 10 for the demo's test numbers, with the country
  // code otherwise. Shown as "+91 98765 43210" either way.
  const phone = data?.phone
    ? `+${data.phone.length > 10 ? data.phone.slice(0, -10) : "91"} ${formatPhone(data.phone.slice(-10))}`
    : null;

  return (
    <ParentShell>
      <header className="px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">More</h1>
        {phone && <p className="text-sm text-foreground-muted">Signed in as {phone}</p>}
      </header>

      <div className="flex w-full max-w-2xl flex-col gap-6 px-5 py-3 pb-8">
        {data === null && loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : data === null ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : (
          <>
            {data.profile && (
              <MenuSection title="Your doctor">
                <MenuRow
                  href="/doctor"
                  leading={
                    data.profile.photo ? (
                      <Image
                        src={data.profile.photo}
                        alt=""
                        width={48}
                        height={48}
                        className="size-12 shrink-0 rounded-full object-cover object-top"
                      />
                    ) : (
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                        <Stethoscope aria-hidden className="size-5" />
                      </span>
                    )
                  }
                  title={data.profile.name}
                  subtitle={[data.profile.experience, data.profile.title].filter(Boolean).join(" · ")}
                />
              </MenuSection>
            )}

            <MenuSection title="Account">
              <MenuRow
                onClick={() => setEditingName(true)}
                icon={UserRound}
                title={data.name ?? "Add your name"}
                subtitle="Your name, as the doctor sees it. Tap to change it."
              />
              <MenuRow
                onClick={() => void signOut()}
                icon={LogOut}
                title={signingOut ? "Signing out…" : "Sign out"}
                danger
              />
            </MenuSection>
          </>
        )}
      </div>

      {editingName && data && (
        <EditNameSheet
          current={data.name ?? ""}
          onClose={() => setEditingName(false)}
          onSaved={(name) => setData((current) => (current ? { ...current, name } : current))}
        />
      )}
    </ParentShell>
  );
}

/** Change the parent's name — the one the doctor and front desk see. */
function EditNameSheet({
  current,
  onClose,
  onSaved,
}: {
  current: string;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  async function save() {
    setBusy(true);
    try {
      const saved = await getBrowserApi().parents.completeProfile({ name: trimmed });
      onSaved(saved.name ?? trimmed);
      toast("Name updated", "success");
      onClose();
    } catch (caught) {
      toast(errorMessage(caught), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Your name"
      footer={
        <Button
          fullWidth
          loading={busy}
          disabled={!trimmed || trimmed === current}
          onClick={() => void save()}
        >
          Save name
        </Button>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed && trimmed !== current) void save();
        }}
      >
        <TextField
          label="Your name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          hint="The doctor and the front desk see this next to your child's details."
        />
      </form>
    </Sheet>
  );
}
