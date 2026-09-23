"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { cn, errorMessage } from "@/lib/format";

const stars = [1, 2, 3, 4, 5] as const;

/**
 * Rates the app, and asks nothing else — no feedback box, no doctor rating.
 * Shown only to a parent who has never rated; one rating per parent, ever.
 */
export function RatingPrompt({ visitId }: { visitId: UUID }) {
  const toast = useToast();
  const [submitted, setSubmitted] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function rate(value: (typeof stars)[number]) {
    setBusy(true);
    try {
      await getBrowserApi().visits.submitRating(visitId, value);
      setSubmitted(value);
      toast("Thanks for the feedback", "success");
    } catch (caught) {
      // Rated from another device meanwhile: say thanks, don't ask again.
      if ((caught as { code?: string }).code === "ALREADY_RATED") {
        setSubmitted(value);
        toast(errorMessage(caught), "success");
      } else {
        toast(errorMessage(caught), "error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col items-center gap-3 py-5">
      <p className="text-center font-semibold text-foreground">
        {submitted ? "Thanks for rating the app" : "How is this app working for you?"}
      </p>

      <div className="flex gap-1">
        {stars.map((value) => {
          const filled = (hovered ?? submitted ?? 0) >= value;
          return (
            <button
              key={value}
              type="button"
              disabled={busy || submitted !== null}
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              onMouseEnter={() => setHovered(value)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => void rate(value)}
              className="flex size-12 items-center justify-center disabled:cursor-default"
            >
              <Star
                className={cn(
                  "size-7 transition-colors",
                  filled
                    ? "fill-accent-400 text-accent-400"
                    : "text-neutral-300 dark:text-neutral-600"
                )}
              />
            </button>
          );
        })}
      </div>
    </Card>
  );
}
