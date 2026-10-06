import { Check, Circle, LoaderCircle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button, ButtonLink } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import type { CvStatus } from "@/entities/cv/schemas";
import { failureMessage } from "@/entities/cv/lib/failure-copy";
import { stageStates, type StageState } from "@/features/cv-generation/model/stages";

function StageSymbol({ state }: { state: StageState }) {
  const base = "flex size-7 shrink-0 items-center justify-center rounded-full";
  switch (state) {
    case "done":
      return (
        <span className={`${base} bg-canvas motion-safe:animate-check-in`}>
          <Check aria-hidden className="size-4 text-success" strokeWidth={1.5} />
        </span>
      );
    case "active":
      return (
        <span className={`${base} bg-accent-tint`}>
          <LoaderCircle aria-hidden className="size-4 text-accent motion-safe:animate-spin" strokeWidth={1.5} />
        </span>
      );
    case "failed":
      return (
        <span aria-hidden className={`${base} bg-danger-tint text-sm font-bold text-danger`}>
          !
        </span>
      );
    default:
      return (
        <span className={`${base} bg-canvas`}>
          <Circle aria-hidden className="size-4 text-placeholder" strokeWidth={1.5} />
        </span>
      );
  }
}

function Stage({
  state,
  title,
  description,
}: {
  state: StageState;
  title: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <StageSymbol state={state} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className={`text-sm leading-[normal] font-medium ${state === "waiting" ? "text-muted" : "text-ink"}`}>
          {title}
          {state === "done" ? <span className="sr-only"> (done)</span> : null}
          {state === "active" ? <span className="sr-only"> (in progress)</span> : null}
          {state === "failed" ? <span className="sr-only"> (failed)</span> : null}
        </p>
        <p className={`text-xs leading-normal ${state === "failed" ? "text-danger" : "text-muted"}`}>
          {description}
        </p>
      </div>
    </li>
  );
}

/**
 * The honest bar: the API reports a state, not a percentage, so the active bar is indeterminate, the
 * finished bar is full and the stopped bar is a plain red rule (both also stated in text).
 */
function ProgressBar({ state }: { state: "waiting" | "active" | "done" | "failed" }) {
  if (state === "failed") {
    return <div aria-hidden className="h-1.5 w-full rounded-full bg-danger" />;
  }
  if (state === "done") {
    return <div aria-hidden className="h-1.5 w-full rounded-full bg-success transition-colors duration-500" />;
  }
  return (
    <div
      role="progressbar"
      aria-label={state === "waiting" ? "Waiting to start" : "Generation in progress"}
      className="h-1.5 w-full overflow-hidden rounded-full bg-accent-tint"
    >
      <div
        className={`h-full rounded-full bg-accent ${
          state === "waiting" ? "w-[6%]" : "w-1/3 motion-safe:animate-indeterminate"
        }`}
      />
    </div>
  );
}

interface GenerationProgressProps {
  status: Pick<CvStatus, "status" | "sourceType" | "failureReason">;
  onRetry: () => void;
  retrying: boolean;
  /** A safe message about a failed retry attempt, if any. */
  retryError: string | null;
}

/**
 * Figma "Generation progress" for the in-progress (`PENDING` / `PROCESSING`), failed and just
 * completed states. Nothing here is a made-up percentage: stages follow the persisted status only.
 */
export function GenerationProgress({ status, onRetry, retrying, retryError }: GenerationProgressProps) {
  const failed = status.status === "FAILED";
  const processing = status.status === "PROCESSING";
  const completed = status.status === "COMPLETED";
  const stages = stageStates(status.status);
  const sourceDescription =
    status.sourceType === "PDF"
      ? "Your PDF has been read successfully."
      : "Your background has been saved.";

  return (
    <Card className="flex min-w-0 flex-1 flex-col gap-8 px-5 py-8 sm:p-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base leading-[normal] font-semibold text-ink">
            {failed ? "Generation stopped" : completed ? "Your draft is ready" : "Building your draft"}
          </h2>
          <p
            className={`text-[13px] leading-[normal] font-medium ${
              failed ? "text-danger" : completed ? "text-success" : "text-accent"
            }`}
          >
            {failed ? "Stopped" : completed ? "Done" : processing ? "In progress" : "Waiting to start"}
          </p>
        </div>
        <ProgressBar state={failed ? "failed" : completed ? "done" : processing ? "active" : "waiting"} />
      </div>

      <ol className="flex flex-col gap-6">
        <Stage state={stages.preparing} title="Preparing information" description={sourceDescription} />
        <Stage
          state={stages.structuring}
          title="Structuring experience"
          description={
            failed
              ? failureMessage(status.failureReason)
              : completed
                ? "Your roles, education and skills are organized."
                : processing
                  ? "Organizing your roles, education and skills."
                  : "Waiting for a free slot. This starts automatically."
          }
        />
        <Stage
          state={stages.generating}
          title="Generating CV"
          description={
            failed
              ? "Starts again when you retry."
              : completed
                ? "Opening your editable draft…"
                : "Up next: your editable first draft."
          }
        />
      </ol>

      <hr className="border-line" />

      <div className="flex flex-col gap-3">
        <p className="text-sm leading-[normal] font-medium text-ink">
          {failed ? "Your information is safe." : completed ? "All done." : "Good work takes a moment."}
        </p>
        <p className="text-[13px] leading-[1.6] text-muted">
          {failed
            ? `Your target role and ${status.sourceType === "PDF" ? "PDF" : "background"} are saved. Retry generation, or go back to change them.`
            : completed
              ? "Your first draft is ready to review. Every section stays editable."
              : "Generation continues even if you leave this page. You can check the progress in My CVs and open your draft when it’s ready."}
        </p>
      </div>

      {retryError ? (
        <p role="alert" className="rounded-lg bg-danger-tint p-3 text-[13px] text-danger">
          <span className="font-medium">Error: </span>
          {retryError}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        {failed ? (
          <>
            <Button type="button" onClick={onRetry} disabled={retrying}>
              <RotateCw aria-hidden className="size-4" strokeWidth={1.75} />
              {retrying ? "Retrying…" : "Retry generation"}
            </Button>
            <ButtonLink href="/cvs" variant="secondary">
              Back to My CVs
            </ButtonLink>
          </>
        ) : (
          <ButtonLink href="/cvs" variant="secondary">
            Back to My CVs
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}

export function GenerationIntro({
  badge,
  title,
  role,
}: {
  badge: ReactNode;
  title: string;
  role: string;
}) {
  return (
    <div className="flex min-w-0 max-w-full flex-col items-start gap-3">
      {badge}
      <h1 className="max-w-full text-[26px] leading-[normal] font-semibold text-ink sm:text-[30px]">
        {title}
      </h1>
      {/* `anywhere` also shrinks the min-content width, so a long unbroken role cannot widen the page. */}
      <p className="max-w-full text-sm leading-[1.6] text-muted [overflow-wrap:anywhere]">{role}</p>
    </div>
  );
}
