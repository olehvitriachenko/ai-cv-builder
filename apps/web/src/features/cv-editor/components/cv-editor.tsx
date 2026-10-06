"use client";

import { useState } from "react";
import { getCvResult } from "@/features/cv-editor/api/draft";
import { type CvResult } from "@/entities/cv/schemas";
import { EditorWorkspace } from "./editor-workspace";

/**
 * Holds the server's latest result. Loading a newer version swaps the result and remounts the
 * workspace (new form defaults, new autosaver on the new revision), so there is never a half-reset
 * form. Everything the user sees after a reload comes from the server.
 */
export function CvEditor({ cvId, initialResult }: { cvId: string; initialResult: CvResult }) {
  const [version, setVersion] = useState<{ key: number; result: CvResult; notice: string | null; appliedQuestionId: string | null }>({
    key: 0,
    result: initialResult,
    notice: null,
    appliedQuestionId: null,
  });

  return (
    <EditorWorkspace
      key={version.key}
      cvId={cvId}
      result={version.result}
      fetchLatest={() => getCvResult(cvId)}
      notice={version.notice}
      appliedQuestionId={version.appliedQuestionId}
      onReplace={(result, notice, appliedQuestionId) => setVersion((current) => ({ key: current.key + 1, result, notice: notice ?? null, appliedQuestionId: appliedQuestionId ?? null }))}
    />
  );
}
