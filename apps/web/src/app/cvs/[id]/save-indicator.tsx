import { CircleAlert, Cloud, CloudCheck, LoaderCircle } from "lucide-react";
import type { SaveState } from "@/lib/cv/autosave";

/**
 * Figma "Save indicator": Saved, Saving… and Error. Text always carries the meaning (the icon and
 * colour only reinforce it) and the region is polite-live so changes are announced.
 */
export function SaveIndicator({ state, invalid }: { state: SaveState; invalid: boolean }) {
  let icon;
  let label: string;
  let tone = "text-muted";

  if (invalid) {
    icon = <CircleAlert aria-hidden className="size-3.5" strokeWidth={1.75} />;
    label = "Fix the highlighted fields to save";
    tone = "text-danger";
  } else if (state.status === "saving") {
    icon = <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" strokeWidth={1.75} />;
    label = "Saving…";
  } else if (state.status === "dirty") {
    icon = <Cloud aria-hidden className="size-3.5" strokeWidth={1.75} />;
    label = "Unsaved changes";
  } else if (state.status === "error") {
    icon = <CircleAlert aria-hidden className="size-3.5" strokeWidth={1.75} />;
    label = "Error";
    tone = "text-danger";
  } else if (state.status === "conflict") {
    icon = <CircleAlert aria-hidden className="size-3.5" strokeWidth={1.75} />;
    label = state.failure === "gone" ? "Can’t save" : "Out of date";
    tone = "text-danger";
  } else {
    icon = <CloudCheck aria-hidden className="size-3.5" strokeWidth={1.75} />;
    label = "All changes saved";
  }

  return (
    <p role="status" className={`flex items-center gap-1.5 text-xs whitespace-nowrap ${tone}`}>
      {icon}
      {label}
    </p>
  );
}
