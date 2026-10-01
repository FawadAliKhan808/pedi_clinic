"use client";

import { ArrowLeft, Stethoscope } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DoctorProfileView } from "@/components/parent/doctor-profile-view";
import { ParentShell } from "@/components/parent/parent-shell";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import type { DoctorProfile } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { useAppBack } from "@/lib/navigation/back";
import { errorMessage } from "@/lib/format";

/**
 * "Know about your doctor". Strict top-to-bottom order: name, photo, title and
 * experience, location, qualifications & languages, areas of expertise,
 * professional highlights. Content comes from the clinic's `doctor_profile`
 * setting.
 */
export default function KnowYourDoctorPage() {
  const router = useRouter();
  const goBack = useAppBack("/more");
  const [profile, setProfile] = useState<DoctorProfile | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const api = getBrowserApi();
      if (!(await api.auth.getCurrentUserId())) {
        router.replace("/");
        return;
      }
      const result = await api.clinic.getDoctorProfile();
      if (!cancelled) setProfile(result);
    })().catch((caught) => {
      if (!cancelled) setLoadError(errorMessage(caught));
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <ParentShell>
      <div className="relative mx-auto flex w-full max-w-2xl flex-col px-5 pb-10 pt-[calc(1rem+env(safe-area-inset-top))]">
        {/* Back sits beside the page, not above it, so the name stays first. */}
        {/* Opened from Home or from More: go back to whichever it was, or to
            More if this page was opened directly (a shared link). */}
        <button
          type="button"
          aria-label="Back"
          onClick={goBack}
          className="absolute left-2 top-[calc(0.75rem+env(safe-area-inset-top))] flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
        >
          <ArrowLeft className="size-5" />
        </button>

        {profile === undefined && loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : profile === undefined ? (
          <div className="flex flex-col items-center gap-4 pt-14">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="aspect-[419/484] w-full max-w-xs rounded-3xl" />
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : profile === null ? (
          <EmptyState
            icon={<Stethoscope className="size-8" />}
            title="Doctor's profile coming soon"
            description="The clinic hasn't added the doctor's details yet."
          />
        ) : (
          <DoctorProfileView profile={profile} />
        )}
      </div>
    </ParentShell>
  );
}
