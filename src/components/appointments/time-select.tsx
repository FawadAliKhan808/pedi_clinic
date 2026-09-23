"use client";

import { ChevronDown } from "lucide-react";
import { useId, type ReactNode } from "react";

/** A wall-clock time in 12-hour parts, as the doctor picks it. */
export interface TimeParts {
  hour: number; // 1–12
  minute: number; // a multiple of the slot length
  period: "am" | "pm";
}

/** "HH:MM" (24-hour) for the API, e.g. { 2, 30, pm } → "14:30". */
export function toClockTime({ hour, minute, period }: TimeParts): string {
  const hours24 = (hour % 12) + (period === "pm" ? 12 : 0);
  return `${String(hours24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Minutes from midnight — for durations and ordering. */
export function minutesOfDay(parts: TimeParts): number {
  return ((parts.hour % 12) + (parts.period === "pm" ? 12 : 0)) * 60 + parts.minute;
}

/**
 * One dropdown. The native arrow is replaced by our own chevron so the
 * padding is predictable: text gets the left of the box, the chevron a fixed
 * lane on the right, and a minimum width keeps "12", ":30" and "PM" whole.
 */
function Dropdown({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative min-w-[4.75rem] flex-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full appearance-none rounded-lg border border-border bg-surface py-2 pl-3 pr-8 text-base font-semibold tabular-nums text-foreground focus:outline-2 focus:outline-offset-1 focus:outline-primary-500"
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
      />
    </div>
  );
}

/**
 * Hour, minute and AM/PM as three dropdowns. Minutes only offer whole slots
 * (":00" and ":30" for 30-minute slots), so an off-grid time can't be picked.
 */
export function TimeSelect({
  label,
  value,
  slotMinutes,
  onChange,
}: {
  label: string;
  value: TimeParts;
  slotMinutes: number;
  onChange: (value: TimeParts) => void;
}) {
  const id = useId();
  const minutes = Array.from(
    { length: Math.max(1, Math.floor(60 / slotMinutes)) },
    (_, index) => index * slotMinutes
  );

  return (
    <fieldset className="flex min-w-0 flex-col">
      <legend className="mb-1.5 text-sm font-semibold text-foreground">{label}</legend>
      <div className="flex gap-2">
        <Dropdown
          id={`${id}-hour`}
          label={`${label} hour`}
          value={value.hour}
          onChange={(hour) => onChange({ ...value, hour: Number(hour) })}
        >
          {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </Dropdown>
        <Dropdown
          id={`${id}-minute`}
          label={`${label} minutes`}
          value={value.minute}
          onChange={(minute) => onChange({ ...value, minute: Number(minute) })}
        >
          {minutes.map((minute) => (
            <option key={minute} value={minute}>
              :{String(minute).padStart(2, "0")}
            </option>
          ))}
        </Dropdown>
        <Dropdown
          id={`${id}-period`}
          label={`${label} AM or PM`}
          value={value.period}
          onChange={(period) => onChange({ ...value, period: period as TimeParts["period"] })}
        >
          <option value="am">AM</option>
          <option value="pm">PM</option>
        </Dropdown>
      </div>
    </fieldset>
  );
}
