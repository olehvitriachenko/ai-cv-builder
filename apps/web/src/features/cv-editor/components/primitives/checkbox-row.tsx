"use client";

import { Check } from "lucide-react";
import { useId } from "react";

/** "Current mode control" (Figma 06.3): an 18 px box inside a 44 px touch target, with its label. */
export function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2">
      <span className="flex size-11 shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="flex size-[18px] items-center justify-center rounded-sm border border-line bg-surface text-white peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      </span>
      <span className="min-w-0 flex-1 text-[13px] leading-[18px] text-ink">{label}</span>
    </label>
  );
}
