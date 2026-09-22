"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/**
 * Full-screen sheet — phone-first, so never a small centred dialog.
 * Respects the bottom safe area for its content.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 mx-auto flex w-full max-w-md flex-col bg-surface motion-safe:animate-[sheet-in_180ms_ease-out]"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex size-12 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

      {footer && (
        <div className="border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {footer}
        </div>
      )}
    </div>
  );
}
