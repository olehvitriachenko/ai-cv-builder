"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/shared/ui/button";
import { fetchCvPdf } from "@/features/pdf-download/api";
import {
  DownloadBlockedError,
  browserDownload,
  downloadOutcome,
  downloadPdf,
} from "@/features/pdf-download/model/download-flow";

/**
 * "Download PDF" for one CV, used by the editor and by My CVs. It owns the busy and failure
 * states; the precondition (saving the editor's pending edits) comes from the caller.
 */
export function DownloadPdfButton({
  cvId,
  variant,
  size = "compact",
  label = "Download PDF",
  showIcon = false,
  disabledReason = null,
  beforeDownload,
  onMessage,
}: {
  cvId: string;
  variant?: ButtonVariant;
  /** Compact (36 px) by default; the editor header and the full-screen preview use the regular 44 px button. */
  size?: ButtonSize;
  /** The idle content; a phone shows it as "PDF". */
  label?: ReactNode;
  showIcon?: boolean;
  /** Why the action is unavailable (the CV has no draft yet), or null when it is available. */
  disabledReason?: string | null;
  /** Runs before the request; throws `DownloadBlockedError` to stop with an explanation. */
  beforeDownload?: () => Promise<void>;
  /**
   * Reports the failure message instead of rendering it next to the button, for a caller whose
   * layout cannot grow (the editor header keeps its height in every state).
   */
  onMessage?: (message: string | null) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // State updates are asynchronous, so two clicks in the same frame would both see `busy` as false.
  const inFlight = useRef(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const setMessage = (next: string | null) => {
    setInlineMessage(next);
    onMessage?.(next);
  };

  async function handleClick(): Promise<void> {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await beforeDownload?.();
      await downloadPdf({ fetchPdf: () => fetchCvPdf(cvId), browser: browserDownload() });
    } catch (error) {
      if (error instanceof DownloadBlockedError) {
        setMessage(error.message);
        return;
      }
      const outcome = downloadOutcome(error);
      if (outcome.kind === "signin") {
        router.replace("/login");
        return;
      }
      setMessage(outcome.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const unavailable = disabledReason !== null;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        stretch={false}
        disabled={unavailable || busy}
        aria-busy={busy}
        title={unavailable ? disabledReason : undefined}
        onClick={() => void handleClick()}
      >
        {busy ? (
          <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" strokeWidth={1.75} />
        ) : showIcon ? (
          <Download aria-hidden className="size-4" strokeWidth={1.75} />
        ) : null}
        {busy ? (
          <>
            <span className="hidden sm:inline">Preparing PDF…</span>
            <span className="sm:hidden">PDF…</span>
          </>
        ) : (
          label
        )}
      </Button>
      {/* Announced without moving focus; the button stays available to try again. */}
      {inlineMessage && onMessage === undefined ? (
        <p role="alert" className="basis-full rounded-lg bg-danger-tint p-3 text-[13px] text-danger">
          <span className="font-medium">Error: </span>
          {inlineMessage}
        </p>
      ) : null}
    </>
  );
}
