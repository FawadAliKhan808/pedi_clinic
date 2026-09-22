"use client";

import { Download, Share2, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function withFile(action: (file: File) => Promise<void> | void) {
    setBusy(true);
    try {
      const blob = await fetch(url).then((response) => response.blob());
      await action(new File([blob], "prescription.jpg", { type: blob.type }));
    } catch {
      // Signed URLs expire; reopening the photo gets a fresh one.
    } finally {
      setBusy(false);
    }
  }

  function download() {
    return withFile((file) => {
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(objectUrl);
    });
  }

  function share() {
    return withFile(async (file) => {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Prescription" });
      }
    });
  }

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

      <div className="absolute inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] flex justify-center gap-3">
        <button
          onClick={() => void download()}
          disabled={busy}
          className="flex min-h-12 items-center gap-2 rounded-lg bg-neutral-800/80 px-5 font-semibold text-neutral-0 disabled:opacity-50"
        >
          <Download className="size-4" />
          Download
        </button>
        <ShareButton onShare={() => void share()} busy={busy} />
      </div>
    </div>
  );
}

const noopSubscribe = () => () => {};

/** Web Share with files isn't available everywhere, so the button only appears where it works. */
function ShareButton({ onShare, busy }: { onShare: () => void; busy: boolean }) {
  // Read through useSyncExternalStore so the server snapshot is false and
  // hydration can't mismatch on a capability the server can't see.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(navigator.canShare),
    () => false
  );

  if (!supported) return null;

  return (
    <button
      onClick={onShare}
      disabled={busy}
      className="flex min-h-12 items-center gap-2 rounded-lg bg-neutral-800/80 px-5 font-semibold text-neutral-0 disabled:opacity-50"
    >
      <Share2 className="size-4" />
      Share
    </button>
  );
}
