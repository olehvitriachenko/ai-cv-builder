"use client";

import { Button } from "@/shared/ui/button";
import { RemoveButton } from "../primitives/remove-button";

/** "Remove section" at the right of a section card's title. */
export function RemoveSectionButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <Button type="button" variant="text" size="compact" stretch={false} className="text-danger hover:bg-danger-tint" onClick={onClick}>
      Remove {title.toLowerCase()}
    </Button>
  );
}

/**
 * "+ Add …" row of a section: the only content of an empty section, and the foot of its list once
 * it has entries. A round dark plus and the section's name ("Add Languages").
 */
export function AddEntryButton({ label, disabled = false, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 items-center gap-3 self-start rounded-lg text-sm font-medium text-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-ink"
    >
      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-sm leading-none font-bold text-white">
        +
      </span>
      {label}
    </button>
  );
}

export { RemoveButton };
