"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import type { ClarificationQuestion, CvDraft } from "@/lib/api/cvs";
import { unresolvedCount } from "@/lib/cv/question-form";
import { QuestionCard } from "./question-card";

/**
 * Figma "AI Assistant": the persisted clarification questions, secondary to the document. The
 * server's questions seed the list; each save, dismissal replaces its own question with the
 * server's reply, so what is shown is always what the server stored.
 */
export function ClarificationPanel({
  cvId,
  initialQuestions,
  draft,
}: {
  cvId: string;
  initialQuestions: ClarificationQuestion[];
  draft: CvDraft;
}) {
  const [questions, setQuestions] = useState(initialQuestions);
  const unresolved = unresolvedCount(questions);

  function replace(next: ClarificationQuestion) {
    setQuestions((current) => current.map((question) => (question.id === next.id ? next : question)));
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-tint">
            <Sparkles aria-hidden className="size-4 text-accent" strokeWidth={1.75} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-ink">AI Assistant</h3>
            <p className="text-[11px] text-muted">Clarify missing facts and improve writing</p>
          </div>
        </div>
        {questions.length > 0 ? (
          <span
            role="status"
            className="shrink-0 rounded-full bg-accent-tint px-2 py-1 text-[11px] font-semibold text-accent"
          >
            {unresolved === 0 ? "All resolved" : `${unresolved} unresolved`}
          </span>
        ) : null}
      </div>

      {questions.length === 0 ? (
        <p className="rounded-lg bg-success-tint p-3 text-[13px] leading-normal text-success">
          Nothing to clarify. Everything the draft needed was in your information.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1 text-[11px] leading-normal text-muted">
            <p>Review each item below. Answer when you can, or dismiss what no longer applies.</p>
            <p className="text-[10px]">AI never invents facts. Nothing changes your CV until you apply it.</p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {questions.map((question) => (
              <QuestionCard key={question.id} cvId={cvId} question={question} draft={draft} onChange={replace} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
