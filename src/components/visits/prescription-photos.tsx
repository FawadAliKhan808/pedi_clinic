"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/feedback";
import { getBrowserApi } from "@/lib/api/browser";

/**
 * Resolves private storage keys to short-lived signed URLs. Keys are never
 * public, so nothing here can be linked to or cached long-term.
 */
function useSignedUrls(storageKeys: string[]): string[] | null {
  // Tagged with the keys they answer, so URLs for a previous visit can't be
  // shown against a newly opened one.
  const [answered, setAnswered] = useState<{ keys: string; urls: string[] } | null>(null);
  const keyList = storageKeys.join("|");

  useEffect(() => {
    if (!keyList) return;

    let cancelled = false;
    Promise.all(
      keyList.split("|").map((key) => getBrowserApi().storage.getSignedUrl(key))
    )
      .then((urls) => {
        if (!cancelled) setAnswered({ keys: keyList, urls });
      })
      .catch(() => {
        if (!cancelled) setAnswered({ keys: keyList, urls: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [keyList]);

  if (!keyList) return [];
  return answered?.keys === keyList ? answered.urls : null;
}

export function PrescriptionThumbs({ storageKeys }: { storageKeys: string[] }) {
  const urls = useSignedUrls(storageKeys);
  const [viewing, setViewing] = useState<string | null>(null);

  if (storageKeys.length === 0) return null;

  if (urls === null) {
    return (
      <div className="flex gap-2">
        {storageKeys.map((key) => (
          <Skeleton key={key} className="size-20 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {urls.map((url, index) => (
          <button
            key={url}
            onClick={() => setViewing(url)}
            aria-label={`Open prescription photo ${index + 1}`}
            className="overflow-hidden rounded-lg border border-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs are short-lived and host-varying, so they can't go through the image optimizer */}
            <img
              src={url}
              alt={`Prescription photo ${index + 1}`}
              className="size-20 object-cover"
            />
          </button>
        ))}
      </div>

      {viewing && <PhotoViewer url={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

/** Full-screen viewer. Page pinch-zoom is deliberately left enabled app-wide. */
export function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Prescription photo"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-neutral-900/95 p-4"
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] flex size-12 items-center justify-center rounded-full bg-neutral-800/80 text-neutral-0"
      >
        <X className="size-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img
        src={url}
        alt="Prescription"
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}
