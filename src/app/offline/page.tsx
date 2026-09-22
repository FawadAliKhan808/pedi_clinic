import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're offline",
};

export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-2xl font-semibold text-foreground">
        You&apos;re offline
      </p>
      <p className="max-w-xs text-foreground-muted">
        Check your connection and try again. Your queue status will update as
        soon as you&apos;re back online.
      </p>
    </div>
  );
}
