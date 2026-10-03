import { ParentFrame } from "@/components/parent/parent-shell";
import { Skeleton } from "@/components/ui/feedback";

/**
 * A child's page is rendered per request, so without this a tap waits for the
 * server before anything changes. Next prefetches this and shows it at once.
 */
export default function Loading() {
  return (
    <ParentFrame>
      <div className="flex flex-col gap-4 px-5 pb-6 pt-[calc(1.5rem+env(safe-area-inset-top))]" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </ParentFrame>
  );
}
