import { CircleAlert, LoaderCircle, TriangleAlert } from "lucide-react";
import { answerSaveLabel, type AnswerSave } from "@/lib/cv/question-form";

/**
 * Shows pending or failed answer saves. Successful saves need no separate status row.
 */
export function AnswerStatus({ save }: { save: AnswerSave }) {
  const label = answerSaveLabel(save);
  if (label === null || save === "saved") {
    return null;
  }
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-normal text-muted">
      <span>Answer</span>
      {save === "saving" ? (
        <span className="flex items-center gap-1.5">
          <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" strokeWidth={1.75} />
          {label}
        </span>
      ) : null}
      {save === "error" ? (
        <>
          <span className="flex items-center gap-1.5 text-danger">
            <CircleAlert aria-hidden className="size-3.5" strokeWidth={1.75} />
            Error
          </span>
          <span className="flex items-center gap-1.5 text-danger">
            <TriangleAlert aria-hidden className="size-3.5" strokeWidth={2} />
            {label}
          </span>
        </>
      ) : null}
    </p>
  );
}
