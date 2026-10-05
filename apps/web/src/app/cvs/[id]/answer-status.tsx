import { Check, CircleAlert, LoaderCircle, TriangleAlert } from "lucide-react";
import { answerSaveLabel, type AnswerSave } from "@/lib/cv/question-form";

/**
 * "Answer ✓ Saved" (Figma 07.3 "Answer lifecycle"): the save of the answer, apart from applying
 * it. A failed save says so in words and an icon, and that the answer is retained.
 */
export function AnswerStatus({ save }: { save: AnswerSave }) {
  const label = answerSaveLabel(save);
  if (label === null) {
    return null;
  }
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-normal text-muted">
      <span>Answer</span>
      {save === "saved" ? (
        <span className="flex items-center gap-1.5">
          <Check aria-hidden className="size-3.5" strokeWidth={1.75} />
          {label}
        </span>
      ) : null}
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
