import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import type { SaveState } from "@/lib/cv/autosave";
import { saveView } from "@/lib/cv/save-view";

/**
 * Figma "Save indicator" (09.1, 09.2, 11.1): All changes saved, Saving…, Couldn't save · Retry and
 * Conflict · Review versions. The last two are buttons (retry the save, open the review). Text
 * always carries the meaning, the icon and colour only reinforce it, and the region is polite-live
 * so changes are announced. On a phone the short label is shown.
 */
export function SaveIndicator({
  state,
  invalid,
  onRetry,
  onReview,
}: {
  state: SaveState;
  invalid: boolean;
  onRetry: () => void;
  onReview: () => void;
}) {
  const view = saveView(state, invalid);
  const icon =
    view.icon === "check" ? (
      <Check aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
    ) : view.icon === "spinner" ? (
      <LoaderCircle aria-hidden className="size-3.5 shrink-0 motion-safe:animate-spin" strokeWidth={1.75} />
    ) : (
      <CircleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
    );
  const tone = view.tone === "danger" ? "text-danger" : "text-muted";
  const content = (
    <>
      {icon}
      <span className="hidden sm:inline">{view.label}</span>
      <span className="sm:hidden">{view.shortLabel}</span>
    </>
  );

  return (
    <div role="status" className={`flex items-center text-xs whitespace-nowrap ${tone}`}>
      {view.action === null ? (
        <p className="flex items-center gap-1.5">{content}</p>
      ) : (
        <button
          type="button"
          onClick={view.action === "retry" ? onRetry : onReview}
          className="flex min-h-11 items-center gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {content}
        </button>
      )}
    </div>
  );
}
