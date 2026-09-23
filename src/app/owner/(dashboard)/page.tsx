import { Star } from "lucide-react";
import { ChartCard, DataTable } from "@/components/charts/chart-card";
import { formatPercent } from "@/components/charts/scale";
import { SplitBar } from "@/components/charts/split-bar";
import { StatTile } from "@/components/charts/stat-tile";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { RatingDistribution } from "@/components/owner/rating-distribution";
import { getServerApi } from "@/lib/api/server";

export const metadata = { title: "Owner dashboard" };

export default async function OwnerDashboardPage() {
  const api = await getServerApi();
  const { ratings, adoption, usage } = await api.analytics.getOwnerOverview();
  const stars = [5, 4, 3, 2, 1] as const;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col @container">
      <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Owner dashboard</h1>
          <p className="text-sm text-foreground-muted">
            How parents rate and use the app. All-time figures.
          </p>
        </div>
        <SignOutButton redirectTo="/owner/login" variant="icon" />
      </header>

      <div className="grid gap-4 px-5 py-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] @3xl:grid-cols-2">
        <ChartCard
          title="App rating"
          subtitle="Given by parents after a visit"
          className="@3xl:row-span-2"
          table={
            <DataTable
              columns={["Stars", "Ratings", "Share"]}
              rows={stars.map((star) => [
                `${star} star`,
                ratings.distribution[star],
                formatPercent(ratings.distribution[star], ratings.count),
              ])}
            />
          }
        >
          <div className="flex flex-col gap-5">
            <p className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-foreground">
                {ratings.average === null ? "—" : ratings.average.toFixed(1)}
              </span>
              <Star aria-hidden className="size-6 self-center text-foreground-muted" />
              <span className="text-sm text-foreground-muted">
                from {ratings.count} {ratings.count === 1 ? "rating" : "ratings"}
              </span>
            </p>
            <RatingDistribution distribution={ratings.distribution} total={ratings.count} />
          </div>
        </ChartCard>

        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-foreground">Adoption</h2>
          <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @3xl:grid-cols-2 @5xl:grid-cols-3">
            <StatTile label="Parents registered" value={adoption.parentsRegistered} />
            <StatTile
              label="Installed the app"
              value={adoption.installed}
              hint={`${formatPercent(adoption.installed, adoption.parentsRegistered)} of parents`}
            />
            <StatTile
              label="Notifications on"
              value={adoption.notificationsEnabled}
              hint={`${formatPercent(adoption.notificationsEnabled, adoption.parentsRegistered)} of parents`}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
          <h2 className="font-semibold text-foreground">Usage</h2>
          <SplitBar
            title="How tokens were created"
            parts={[
              { label: "From the app", value: usage.appTokens, colorClass: "bg-chart-1" },
              { label: "Walk-ins added by staff", value: usage.walkIns, colorClass: "bg-chart-2" },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
