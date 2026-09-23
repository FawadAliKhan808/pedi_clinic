import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="text-2xl font-semibold text-foreground">Page not found</p>
      <p className="max-w-xs text-foreground-muted">
        That link doesn&apos;t lead anywhere. It may be old or mistyped.
      </p>
      <Link
        href="/"
        className="flex min-h-12 items-center rounded-lg px-5 font-semibold text-primary-600 hover:bg-surface-sunken"
      >
        Go to home
      </Link>
    </div>
  );
}
