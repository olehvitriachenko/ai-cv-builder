"use client";

import { useState } from "react";
import { getCvResult, type CvResult } from "@/lib/api/cvs";
import { EditorWorkspace } from "./editor-workspace";

/**
 * Holds the server's latest result. Loading a newer version swaps the result and remounts the
 * workspace (new form defaults, new autosaver on the new revision), so there is never a half-reset
 * form. Everything the user sees after a reload comes from the server.
 */
export function CvEditor({ cvId, targetRole, initialResult }: { cvId: string; targetRole: string; initialResult: CvResult }) {
  const [version, setVersion] = useState({ key: 0, result: initialResult });

  return (
    <EditorWorkspace
      key={version.key}
      cvId={cvId}
      targetRole={targetRole}
      result={version.result}
      fetchLatest={() => getCvResult(cvId)}
      onReplace={(result) => setVersion((current) => ({ key: current.key + 1, result }))}
    />
  );
}
