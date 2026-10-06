import { CircleAlert, TriangleAlert } from "lucide-react";
import { answerSaveLabel, type AnswerSave } from "@/features/cv-editor/model/question-form";

/**
 * Autosave announcements are hidden visually so typing never shifts the actions.
 */
export function AnswerStatus({ save }: { save: AnswerSave }) {
  const label = answerSaveLabel(save);
  if (label === null || save === "saved") {
    return null;
  }
  if (save === "saving") {
    return <p role="status" className="sr-only">Saving answer…</p>;
  }
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-normal text-muted">
      <span>Answer</span>
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
