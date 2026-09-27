"use client";

import { LogOut, Stethoscope } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSignOut } from "@/components/layout/sign-out-button";
import { ParentShell } from "@/components/parent/parent-shell";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { MenuRow, MenuSection } from "@/components/ui/menu-list";
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
  const [data, setData] = useState<{ profile: DoctorProfile | null; phone: string | null } | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const api = getBrowserApi();
      if (!(await api.auth.getCurrentUserId())) {
        router.replace("/");
        return;
      }
      const [profile, phone] = await Promise.all([
        api.clinic.getDoctorProfile(),
        api.auth.getCurrentPhone(),
      ]);
      if (!cancelled) setData({ profile, phone });
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
                onClick={() => void signOut()}
                icon={LogOut}
                title={signingOut ? "Signing out…" : "Sign out"}
                danger
              />
            </MenuSection>
          </>
        )}
      </div>
    </ParentShell>
  );
}
