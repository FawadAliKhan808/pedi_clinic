import {
  Award,
  CheckCircle2,
  GraduationCap,
  Languages,
  MapPin,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import type { DoctorProfile } from "@/lib/api";

/**
 * The doctor's profile, strictly top to bottom: name, photo, title and
 * experience, location, qualifications & languages, areas of expertise,
 * professional highlights. Sections with no data are left out.
 */
export function DoctorProfileView({ profile }: { profile: DoctorProfile }) {
  return (
    <article className="flex flex-col items-center gap-6">
      {/* 1. Name */}
      <h1 className="px-12 pt-2 text-center text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        {profile.name}
      </h1>

      {/* 2. Photo */}
      {profile.photo && (
        <figure className="w-full max-w-xs overflow-hidden rounded-3xl bg-gradient-to-b from-primary-50 to-surface-raised p-2 shadow-lg ring-1 ring-border dark:from-primary-900/30">
          <Image
            src={profile.photo}
            alt={`Portrait of ${profile.name}`}
            width={419}
            height={484}
            priority
            className="h-auto w-full rounded-2xl"
          />
        </figure>
      )}

      {/* 3. Title & experience */}
      <p className="text-center text-lg font-semibold text-primary-700 dark:text-primary-300">
        {[profile.title, profile.experience].filter(Boolean).join(" | ")}
      </p>

      {/* 4. Location */}
      {profile.location && (
        <p className="-mt-3 flex items-center justify-center gap-1.5 text-center text-sm text-foreground-muted">
          <MapPin aria-hidden className="size-4 shrink-0 text-accent-600" />
          {profile.location}
        </p>
      )}

      {/* 5. Qualifications & languages */}
      {(profile.qualifications.length > 0 || profile.languages.length > 0) && (
        <section aria-labelledby="doctor-credentials" className="flex w-full flex-col gap-4">
          <h2 id="doctor-credentials" className="sr-only">
            Qualifications and languages
          </h2>
          {profile.qualifications.length > 0 && (
            <PillGroup
              icon={<GraduationCap aria-hidden className="size-4" />}
              label="Qualifications"
              items={profile.qualifications}
              pillClassName="border-primary-200 bg-primary-50 text-primary-800 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-200"
            />
          )}
          {profile.languages.length > 0 && (
            <PillGroup
              icon={<Languages aria-hidden className="size-4" />}
              label="Speaks"
              items={profile.languages}
              pillClassName="border-accent-200 bg-accent-50 text-accent-800 dark:border-accent-800 dark:bg-accent-900/30 dark:text-accent-200"
            />
          )}
        </section>
      )}

      {/* 6. Areas of expertise */}
      {profile.expertise.length > 0 && (
        <section
          aria-labelledby="doctor-expertise"
          className="w-full rounded-2xl border border-border bg-surface-raised p-5 shadow-sm"
        >
          <h2
            id="doctor-expertise"
            className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground"
          >
            <Sparkles aria-hidden className="size-5 text-primary-600" />
            Areas of expertise
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {profile.expertise.map((area) => (
              <li
                key={area}
                className="flex items-start gap-3 rounded-xl bg-surface-sunken px-4 py-3 text-sm font-medium text-foreground"
              >
                <Stethoscope aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-600" />
                {area}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 7. Professional highlights */}
      {profile.highlights.length > 0 && (
        <section
          aria-labelledby="doctor-highlights"
          className="w-full rounded-2xl border border-border bg-surface-raised p-5 shadow-sm"
        >
          <h2
            id="doctor-highlights"
            className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground"
          >
            <Award aria-hidden className="size-5 text-accent-600" />
            Professional highlights
          </h2>
          <ul className="flex flex-col gap-3">
            {profile.highlights.map((highlight) => (
              <li key={highlight} className="flex items-start gap-3 text-foreground">
                <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function PillGroup({
  icon,
  label,
  items,
  pillClassName,
}: {
  icon: ReactNode;
  label: string;
  items: string[];
  pillClassName: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        {icon}
        {label}
      </p>
      <ul className="flex flex-wrap justify-center gap-2">
        {items.map((item) => (
          <li
            key={item}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${pillClassName}`}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
