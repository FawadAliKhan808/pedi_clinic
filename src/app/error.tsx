"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Catches anything a screen didn't handle itself, instead of a blank page. */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="text-2xl font-semibold text-foreground">Something went wrong</p>
      <p className="max-w-xs text-foreground-muted">
        This screen couldn&apos;t load. Check your connection and try again.
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
