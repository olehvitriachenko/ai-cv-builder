import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CvResult, CvStatus } from "@/lib/api/cvs";
import { ClarificationQuestions } from "./clarification-questions";
import { A4Sheet, CvDocument } from "./cv-document";
import { GenerationIntro } from "./generation-progress";

type ResultState =
  | { kind: "loading" }
  | { kind: "error"; retry: () => void }
  | { kind: "ready"; result: CvResult };

function DocumentSkeleton() {
  return (
    <A4Sheet>
      <div aria-busy className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-2.5 w-64 max-w-full" />
        </div>
        {[0, 1, 2].map((section) => (
          <div key={section} className="flex flex-col gap-3">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </A4Sheet>
  );
}

/**
 * The completed result, document first: the CV is the dominant object (right on desktop, first on
 * mobile) and the questions and metadata are compact supporting content. Read-only in this feature.
 */
export function ResultView({ status, state }: { status: CvStatus; state: ResultState }) {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-8 sm:px-8 lg:px-12">
      <GenerationIntro
        badge={<StatusBadge status="COMPLETED" />}
        title="Your CV draft is ready"
        role={status.targetRole}
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <aside className="order-2 flex w-full flex-col gap-4 lg:order-1 lg:w-[400px] lg:shrink-0">
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold text-ink">About this draft</h2>
            <dl className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Target role</dt>
                <dd className="min-w-0 text-right font-medium break-words text-ink">{status.targetRole}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Created from</dt>
                <dd className="font-medium text-ink">
                  {status.sourceType === "PDF" ? "PDF upload" : "Free text"}
                </dd>
              </div>
            </dl>
            <p className="text-xs leading-normal text-muted">
              AI wrote this from your information only. Review wording, dates and claims before
              you use it. This preview is read-only for now.
            </p>
          </Card>

          {state.kind === "ready" ? (
            <ClarificationQuestions questions={state.result.questions} draft={state.result.draft} />
          ) : state.kind === "loading" ? (
            <Card className="flex flex-col gap-3 p-4" aria-busy>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </Card>
          ) : null}
        </aside>

        <section className="order-1 flex min-w-0 flex-1 flex-col gap-3 lg:order-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-ink">Preview</h2>
            <p className="text-[11px] text-muted">A4 · Read-only</p>
          </div>
          <div className="flex flex-col items-center rounded-xl bg-stage p-4 sm:p-6">
            {state.kind === "ready" ? (
              <CvDocument draft={state.result.draft} targetRole={status.targetRole} />
            ) : state.kind === "loading" ? (
              <DocumentSkeleton />
            ) : (
              <div
                role="alert"
                className="flex w-full max-w-[660px] flex-col items-start gap-3 rounded-lg bg-danger-tint p-6"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                  <CircleAlert aria-hidden className="size-4" strokeWidth={1.75} />
                  We couldn’t load your draft.
                </p>
                <p className="text-[13px] leading-normal text-ink">
                  Your CV is saved. Check your connection and try again.
                </p>
                <Button type="button" variant="secondary" size="compact" stretch={false} onClick={state.retry}>
                  Try again
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
