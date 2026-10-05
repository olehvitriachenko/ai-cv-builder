import { Button, ButtonLink } from "@/components/ui/button";
import type { SaveState } from "@/lib/cv/autosave";

/** Figma "Save error message": the edits are still here; nothing was lost. */
export function SaveErrorMessage({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-danger-tint p-4">
      <p className="text-[13px] font-semibold text-danger">Your changes weren’t saved.</p>
      <p className="text-xs leading-normal text-ink">
        Your edits are still here. Check your connection and try again.
      </p>
      <Button type="button" variant="secondary" size="compact" stretch={false} onClick={onRetry}>
        Try saving again
      </Button>
    </div>
  );
}

/**
 * Shown when a save was rejected as out of date, or the CV is gone or no longer editable. Autosave
 * is stopped and the local text is kept until the person chooses. Nothing is merged or overwritten
 * automatically; "Keep my changes" is an explicit overwrite on top of the latest version.
 */
export function ConflictBanner({
  failure,
  busy,
  error,
  onLoadLatest,
  onKeepMine,
}: {
  failure: NonNullable<SaveState["failure"]>;
  busy: boolean;
  error: string | null;
  onLoadLatest: () => void;
  onKeepMine: () => void;
}) {
  if (failure === "gone") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-danger-tint p-4">
        <p className="text-[13px] font-semibold text-danger">This CV can’t be edited any more.</p>
        <p className="text-xs leading-normal text-ink">
          It was deleted, or it is no longer editable. Your last changes could not be saved.
        </p>
        <ButtonLink href="/cvs" variant="secondary" size="compact" stretch={false}>
          Back to My CVs
        </ButtonLink>
      </div>
    );
  }

  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-danger-tint p-4">
      <p className="text-[13px] font-semibold text-danger">This CV changed somewhere else.</p>
      <p className="text-xs leading-normal text-ink">
        Another tab or device saved newer changes, so yours weren’t saved. Your text is still here.
        Load the latest version (your unsaved edits are discarded) or keep your changes and save them
        over the latest version.
      </p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="compact" stretch={false} onClick={onLoadLatest} disabled={busy}>
          Load latest
        </Button>
        <Button type="button" variant="secondary" size="compact" stretch={false} onClick={onKeepMine} disabled={busy}>
          Keep my changes
        </Button>
      </div>
    </div>
  );
}
