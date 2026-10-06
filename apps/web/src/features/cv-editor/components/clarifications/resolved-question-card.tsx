"use client";

import { Button } from "@/shared/ui/button";
import type { ClarificationQuestion } from "@/entities/cv/schemas";
import { sectionLabel, type QuestionView } from "@/lib/cv/question-form";
import { revealSection } from "@/app/cvs/[id]/section-links";

export const KIND_PILL = "rounded-full bg-accent-tint px-2 py-0.5 text-[10px] leading-[normal] font-semibold text-accent";

/** Read-only applied/dismissed presentation; the parent retains timers and mutation state. */
export function ResolvedQuestionCard({ question, view, context, leaving, setKeepVisible }: {
  question: ClarificationQuestion;
  view: QuestionView;
  context: string;
  leaving: boolean;
  setKeepVisible: (visible: boolean) => void;
}) {
    const applied = question.status === "APPLIED";
    return (
      <li
        inert={leaving}
        onMouseEnter={() => setKeepVisible(true)}
        onMouseLeave={() => setKeepVisible(false)}
        onFocus={() => setKeepVisible(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setKeepVisible(false);
        }}
        className={`flex flex-col gap-2 rounded-[10px] border p-3 motion-safe:transition-opacity motion-safe:duration-150 ${leaving ? "opacity-0" : "opacity-100"} ${
          applied ? "border-[#d7e9e1] bg-[#f7fbf9]" : "border-line bg-surface"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={applied ? "rounded-full bg-success-tint px-2 py-0.5 text-[10px] leading-[normal] font-semibold text-success" : KIND_PILL}>
            {view.label}
          </span>
          <p className="min-w-0 text-[11px] leading-[normal] break-words text-muted">{context}</p>
        </div>
        <p className="text-[13px] leading-[1.4] font-medium break-words text-ink">{question.question}</p>
        {applied ? (
          <div>
            <Button
              type="button"
              variant="secondary"
              stretch={false}
              className="text-accent!"
              onClick={() => revealSection(question.section)}
            >
              Review in {sectionLabel(question.section).toLowerCase()}
            </Button>
          </div>
        ) : null}
      </li>
    );
}
