"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/field";
import { answerQuestion, dismissQuestion, type ClarificationQuestion, type CvDraft } from "@/lib/api/cvs";
import { isApiError } from "@/lib/api/fetcher";
import { CVS_QUERY_KEY } from "@/lib/cv/query-keys";
import { answerFormSchema, questionContext, questionView, type AnswerFormValues } from "@/lib/cv/question-form";

function failureMessage(error: unknown): string {
  if (isApiError(error, 409)) {
    return "This question can’t be changed any more. It may already be resolved.";
  }
  if (isApiError(error, 404)) {
    return "This question no longer exists.";
  }
  return "We couldn’t save that. Your answer is still here; try again.";
}

const STATE_STYLES = {
  Unanswered: { card: "border-accent-line bg-surface", label: "text-accent" },
  Answered: { card: "border-accent-line bg-surface", label: "text-accent" },
  Applied: { card: "border-[#d7e9e1] bg-[#f7fbf9]", label: "text-success" },
  Dismissed: { card: "border-line bg-canvas", label: "text-muted" },
} as const;

/**
 * Figma "Factual clarification" card in its four states. Answering saves the answer on the
 * server and does not change the CV; dismissing closes the question without changing it either.
 * Both are explicit buttons: nothing is ever dismissed or applied automatically.
 */
export function QuestionCard({
  cvId,
  question,
  draft,
  onChange,
}: {
  cvId: string;
  question: ClarificationQuestion;
  draft: CvDraft;
  onChange: (question: ClarificationQuestion) => void;
}) {
  const queryClient = useQueryClient();
  const view = questionView(question);
  const style = STATE_STYLES[view.label];
  const { register, handleSubmit, formState } = useForm<AnswerFormValues>({
    defaultValues: { answer: question.answer ?? "" },
    resolver: zodResolver(answerFormSchema),
  });

  const refreshList = () => void queryClient.invalidateQueries({ queryKey: CVS_QUERY_KEY });

  const save = useMutation({
    mutationFn: (values: AnswerFormValues) => answerQuestion(cvId, question.id, values.answer),
    onSuccess: (next) => {
      onChange(next);
      refreshList();
    },
  });
  const dismiss = useMutation({
    mutationFn: () => dismissQuestion(cvId, question.id),
    onSuccess: (next) => {
      onChange(next);
      refreshList();
    },
  });
  const busy = save.isPending || dismiss.isPending;
  const problem = save.isError ? failureMessage(save.error) : dismiss.isError ? failureMessage(dismiss.error) : null;

  return (
    <li className={`flex flex-col gap-2 rounded-[10px] border p-3 ${style.card}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-[11px] break-words text-muted">{questionContext(question, draft)}</p>
        <span className={`shrink-0 text-[10px] font-semibold ${style.label}`}>{view.label}</span>
      </div>

      <p className="text-[13px] leading-[1.4] font-semibold break-words text-ink">{question.question}</p>
      <p className="text-[11px] leading-normal break-words text-muted">{question.missing}</p>

      {view.canAnswer ? (
        <form
          noValidate
          onSubmit={handleSubmit((values) => save.mutate(values))}
          className="flex flex-col gap-2"
        >
          <TextareaField
            label="Your answer"
            rows={2}
            placeholder="e.g. Code reviews, pairing or onboarding"
            error={formState.errors.answer?.message}
            {...register("answer")}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="compact" stretch={false} disabled={busy}>
              {save.isPending ? "Saving…" : question.status === "ANSWERED" ? "Update answer" : "Save answer"}
            </Button>
            <Button type="button" variant="text" size="compact" stretch={false} disabled={busy} onClick={() => dismiss.mutate()}>
              {dismiss.isPending ? "Dismissing…" : "Dismiss"}
            </Button>
          </div>
          {question.status === "ANSWERED" ? (
            <p className="text-[11px] leading-normal text-muted">
              Answer saved. Your CV hasn’t changed yet.
            </p>
          ) : (
            <p className="text-[11px] leading-normal text-muted">
              Saving an answer doesn’t change your CV. You choose when it is applied.
            </p>
          )}
        </form>
      ) : question.status === "APPLIED" ? (
        <p className="text-[13px] leading-[1.4] font-semibold break-words text-ink">
          Your confirmed answer: “{question.answer}”
        </p>
      ) : (
        <p className="text-[12px] leading-normal text-muted">
          Dismissed. This question no longer counts as open and your CV was not changed.
          {question.answer ? ` Your saved answer was “${question.answer}”.` : null}
        </p>
      )}

      {problem ? (
        <p role="alert" className="rounded-lg bg-danger-tint p-2 text-xs text-danger">
          <span className="font-medium">Error: </span>
          {problem}
        </p>
      ) : null}
    </li>
  );
}
