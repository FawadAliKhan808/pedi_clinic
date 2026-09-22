import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/format";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: TextFieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      <input
        {...props}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn(
          "min-h-12 rounded-lg border bg-surface px-4 text-base text-foreground",
          "placeholder:text-neutral-400 focus:outline-2 focus:outline-offset-1 focus:outline-primary-500",
          error ? "border-danger" : "border-border",
          className
        )}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-sm text-foreground-muted">{hint}</p>
      )}
    </div>
  );
}
