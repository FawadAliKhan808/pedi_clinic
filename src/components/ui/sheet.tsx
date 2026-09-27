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

  // Phones: the sheet fills the screen. Tablets/laptops: a drawer on the right
  // over a dimmed page, which a click outside closes.
  return (
    <div className="fixed inset-0 z-50 flex md:justify-end">
      <div
        aria-hidden
        onClick={onClose}
        className="hidden md:block md:flex-1 md:bg-neutral-900/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-full flex-col bg-surface-sunken motion-safe:animate-[sheet-in_180ms_ease-out] md:w-[28rem] md:border-l md:border-border md:shadow-lg"
      >
        <header className="flex items-center justify-between border-b border-border bg-surface-raised px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
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
          <div className="border-t border-border bg-surface-raised px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
