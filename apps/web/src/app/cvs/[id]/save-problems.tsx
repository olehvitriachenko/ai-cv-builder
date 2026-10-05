import { ButtonLink, Button } from "@/components/ui/button";
import type { SaveState } from "@/lib/cv/autosave";

/**
 * "Your latest edits couldn't be saved" (Figma 09.2): the edits stay in the editor, the preview
 * shows the last saved version, and retrying never overwrites another version. Announced as an
 * alert without taking focus from the field the person is typing in.
 */
export function SaveErrorNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger-wash-line bg-surface p-4">
      <p className="text-sm leading-[normal] font-semibold text-danger">Your latest edits couldn’t be saved</p>
      <p className="text-xs leading-normal text-muted">
        Current edits remain in this editor. The preview shows the last saved version. Retrying will not overwrite
        another version.
      </p>
      <Button type="button" variant="text" stretch={false} onClick={onRetry}>
        Retry connection
      </Button>
    </div>
  );
}

/**
 * "A newer saved version needs review" (Figma 09.2): a save was rejected because the CV was saved
 * elsewhere. Nothing is overwritten automatically; the person reviews both versions and chooses.
 * When the CV is gone or no longer editable there is nothing to compare.
 */
export function ConflictNotice({
  failure,
  busy,
  error,
  onReview,
}: {
  failure: NonNullable<SaveState["failure"]>;
  busy: boolean;
  error: string | null;
  onReview: () => void;
}) {
  if (failure === "gone") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger-wash-line bg-danger-tint p-4">
        <p className="text-sm leading-[normal] font-semibold text-danger">This CV can’t be edited any more</p>
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
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-warning-line bg-warning-tint p-4">
      <p className="text-sm leading-[normal] font-semibold text-ink">A newer saved version needs review</p>
      <p className="text-xs leading-normal text-muted">
        Nothing is overwritten automatically. Compare both versions before choosing what to keep.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] leading-[normal] font-semibold text-ink uppercase">Current local · not saved</p>
          <p className="text-xs leading-normal text-muted">Your edits in the fields below</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[11px] leading-[normal] font-semibold text-ink uppercase">Saved account version</p>
          <p className="text-xs leading-normal text-muted">Last known document in preview</p>
        </div>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div>
        <Button type="button" variant="secondary" stretch={false} className="text-accent!" disabled={busy} onClick={onReview}>
          {busy ? "Loading the saved version…" : "Review both versions"}
        </Button>
      </div>
      <p className="text-xs leading-normal text-muted">
        Keep this editor open. Version selection is separate from retrying the connection.
      </p>
    </div>
  );
}
