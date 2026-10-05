"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";
import { applyQuestion, saveDraft, type ClarificationQuestion, type CvResult } from "@/lib/api/cvs";
import { isApiError } from "@/lib/api/fetcher";
import { ApplyBlockedError, applyAnswer, applyErrorOutcome } from "@/lib/cv/apply-flow";
import { DraftAutosaver, type SavePayload } from "@/lib/cv/autosave";
import {
  cvFormSchema,
  toDraft,
  toFormValues,
  toTargetRole,
  type DraftFormValues,
} from "@/lib/cv/draft-form";

function payloadOf(values: DraftFormValues): SavePayload {
  return { draft: toDraft(values), targetRole: toTargetRole(values) };
}

/**
 * The editor's state: the form (the only editable state), the autosaver, what is derived from
 * them on every render (the saved shape, validity) and the two flows that talk to the server
 * (apply an answer, resolve a conflict). The server's revision stays authoritative.
 */
export function useCvEditor({
  cvId,
  result,
  fetchLatest,
  onReplace,
}: {
  cvId: string;
  result: CvResult;
  fetchLatest: () => Promise<CvResult>;
  onReplace: (result: CvResult, notice?: string) => void;
}) {
  const [autosaver] = useState(
    () =>
      new DraftAutosaver({
        initialRevision: result.revision,
        save: (revision, { draft, targetRole }) => saveDraft(cvId, { revision, draft, targetRole }),
      }),
  );
  const saveState = useSyncExternalStore(autosaver.subscribe, autosaver.getState, autosaver.getState);

  const form = useForm<DraftFormValues>({
    defaultValues: toFormValues(result.draft, result.targetRole),
    resolver: zodResolver(cvFormSchema),
    mode: "onChange",
  });
  // Subscribes the editor to every form change, so each keystroke re-renders the preview.
  const watched = useWatch({ control: form.control });
  const [conflictBusy, setConflictBusy] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // The last payload handed to the autosaver. It starts as the form's own reading of the server's
  // draft (not the raw JSON), so opening the editor saves nothing even when the form orders the
  // links differently; reverting an edit still saves, because it differs from this.
  const lastSent = useRef(JSON.stringify(payloadOf(toFormValues(result.draft, result.targetRole))));

  // The saved shape and the validity are derived from the form on every render, never stored.
  const values = form.getValues();
  const payload = payloadOf(values);
  const valid = cvFormSchema.safeParse(values).success;
  const invalid = !valid;

  // A valid change goes to the autosaver; an invalid form is never sent, so the server keeps the
  // last valid version.
  useEffect(() => {
    const json = JSON.stringify(payload);
    if (valid && json !== lastSent.current) {
      lastSent.current = json;
      autosaver.change(payload);
    }
    // `payload` is a new object on every render; the JSON comparison above prevents resends.
  }, [watched, valid, payload, autosaver]);

  // Leaving the page (in-app navigation) saves what is pending instead of dropping it.
  useEffect(
    () => () => {
      void autosaver.flush();
    },
    [autosaver],
  );

  // Closing the tab with unsaved or failed changes asks for confirmation.
  const unsaved = invalid || (saveState.status !== "idle" && saveState.status !== "saved");
  useEffect(() => {
    if (!unsaved) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  /**
   * Applies an answered question. Pending edits are saved first so the apply runs on the latest
   * revision. On success the server's result replaces the form (the server is authoritative); when
   * the CV or the question changed elsewhere, the latest version is loaded instead.
   */
  async function handleApply(question: ClarificationQuestion): Promise<void> {
    setApplying(true);
    try {
      const updated = await applyAnswer({
        blockedReason: invalid ? "Fix the highlighted fields first, then apply the answer." : null,
        flush: () => autosaver.flush(),
        apply: (revision) => applyQuestion(cvId, question.id, revision),
      });
      onReplace(updated, "Answer applied. Your CV was updated.");
    } catch (error) {
      if (error instanceof ApplyBlockedError) {
        throw error;
      }
      const outcome = applyErrorOutcome(error);
      if (outcome.reload) {
        try {
          onReplace(await fetchLatest(), outcome.message);
          return;
        } catch {
          // Could not reload either: fall through and show the message on the card.
        }
      }
      throw new Error(outcome.message);
    } finally {
      setApplying(false);
    }
  }

  async function resolveConflict(keepMine: boolean) {
    setConflictBusy(true);
    setConflictError(null);
    try {
      const latest = await fetchLatest();
      if (keepMine) {
        autosaver.resolveConflict(latest.revision, { keepPending: true });
      } else {
        onReplace(latest);
      }
    } catch (error) {
      setConflictError(
        isApiError(error, 404)
          ? "This CV no longer exists."
          : "We couldn’t reach the server. Try again in a moment.",
      );
    } finally {
      setConflictBusy(false);
    }
  }

  return {
    form,
    values,
    autosaver,
    saveState,
    draft: payload.draft,
    targetRole: payload.targetRole,
    invalid,
    applying,
    handleApply,
    conflictBusy,
    conflictError,
    resolveConflict,
  };
}
