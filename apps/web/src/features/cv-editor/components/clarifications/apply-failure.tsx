import { TriangleAlert } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { APPLY_ACTION_LABELS, type ApplyAction, type ApplyFailure } from "@/features/cv-editor/model/apply-flow";

/**
 * A failed apply (Figma 07.3 "Apply failed · four causes and recovery"): what happened in words,
 * the recovery actions for that cause, and the answer and target that were retained. Nothing was
 * silently applied and the answer is never discarded.
 */
export function ApplyFailureNotice({
  failure,
  retainedAnswer,
  target,
  onAction,
}: {
  failure: ApplyFailure;
  retainedAnswer: string | null;
  target: string;
  onAction: (action: ApplyAction) => void;
}) {
  return (
    <div role="alert" className="flex flex-col gap-3">
      <p className="flex items-start gap-1.5 text-[13px] leading-normal text-danger">
        <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
        <span>
          <span className="sr-only">Error: </span>
          {failure.message}
        </span>
      </p>
      {failure.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {failure.actions.map((action) => (
            <Button
              key={action}
              type="button"
              variant="secondary"
              stretch={false}
              className="text-accent!"
              onClick={() => onAction(action)}
            >
              {APPLY_ACTION_LABELS[action]}
            </Button>
          ))}
        </div>
      ) : null}
      {retainedAnswer ? (
        <p className="text-xs leading-normal break-words text-muted">
          Retained answer: {retainedAnswer}. Target: {target}.
        </p>
      ) : null}
    </div>
  );
}
