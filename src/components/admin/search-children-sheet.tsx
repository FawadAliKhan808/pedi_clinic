"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState, Spinner } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/sheet";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import type { ChildSearchResult, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatAge, formatDate, formatPhone } from "@/lib/format";

export function SearchChildrenSheet({
  clinicId,
  open,
  onClose,
  onSelectChild,
}: {
  clinicId: UUID;
  open: boolean;
  onClose: () => void;
  onSelectChild: (result: ChildSearchResult) => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  // Results are tagged with the query they answer, so a stale response can't
  // be shown against newer input — and no state has to be cleared on change.
  const [answered, setAnswered] = useState<{
    query: string;
    results: ChildSearchResult[];
  } | null>(null);

  const trimmed = query.trim();
  const isSearchable = trimmed.length >= 2;

  useEffect(() => {
    if (trimmed.length < 2) return;

    const timer = setTimeout(() => {
      getBrowserApi()
        .queue.searchChildren(clinicId, trimmed)
        .then((results) => setAnswered({ query: trimmed, results }))
        .catch((caught) => toast(errorMessage(caught), "error"));
    }, 250);

    return () => clearTimeout(timer);
  }, [trimmed, clinicId, toast]);

  const results = answered?.query === trimmed ? answered.results : null;

  return (
    <Sheet open={open} onClose={onClose} title="Search children">
      <div className="flex flex-col gap-4">
        <TextField
          label="Name or phone number"
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />

        {isSearchable && results === null && (
          <div className="flex justify-center py-4 text-foreground-muted">
            <Spinner />
          </div>
        )}

        {isSearchable && results?.length === 0 && (
          <EmptyState
            title="No matches"
            description="Try a different spelling, or search by the parent's phone number."
          />
        )}

        {(results ?? []).map((result) => (
          <button
            key={result.childId}
            type="button"
            onClick={() => onSelectChild(result)}
            className="text-left"
          >
            <Card className="flex flex-col gap-1">
              <p className="font-semibold text-foreground">{result.childName}</p>
              <p className="text-sm text-foreground-muted">
                {formatAge(result.dob)} · {formatPhone(result.parentPhone)}
                {result.parentName ? ` · ${result.parentName}` : ""}
              </p>
              <p className="text-sm text-foreground-muted">
                {result.lastVisitDate
                  ? `Last visit ${formatDate(result.lastVisitDate)}`
                  : "No visits yet"}
              </p>
            </Card>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
