import { Skeleton } from "@/components/ui/feedback";

/**
 * Every staff screen is dynamic (the layout checks the signed-in role), so
 * without this a tab tap waits for the server before anything changes. With
 * it, Next prefetches this skeleton and switches tabs the moment they're
 * tapped; the screen streams in behind it.
 */
export default function StaffScreenLoading() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true">
      <div className="flex flex-col gap-2 px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid gap-3 px-5 py-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
