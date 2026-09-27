import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * Back to the More tab, for the screens reached from it. Phones only: from a
 * tablet up, the sidebar already shows where you are.
 */
export function BackToMore() {
  return (
    <Link
      href="/admin/more"
      aria-label="Back to More"
      className="-ml-3 flex size-12 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-raised md:hidden"
    >
      <ArrowLeft className="size-5" />
    </Link>
  );
}
