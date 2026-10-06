"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** The message appears as soon as the person presses the button. */
const SHOW_AFTER_MS = 0;
/** Once shown it stays at least this long, so a fast download does not make it flash. */
const MIN_VISIBLE_MS = 700;

/**
 * "PDF preparation overlay" (Figma 10.5): while the PDF is being prepared, a soft dimming over the
 * full-screen preview and a centred surface with a spinner, "Preparing your PDF…", a line saying
 * what is happening and the name the file will get. On a phone (Figma 10.6) the surface is 358 px
 * wide and holds a disabled "Preparing…" button under the text. It only informs: the person can
 * still close the preview, and the download carries on. Announced politely, never takes focus.
 */
export function PdfPreparationDialog({
  preparing,
  filename,
  portal = false,
}: {
  preparing: boolean;
  filename: string;
  /** Render on the page itself, for a caller outside the full-screen preview's modal dialog. */
  portal?: boolean;
}) {
  const visible = useDelayedVisibility(preparing);
  if (!visible) {
    return null;
  }
  const overlay = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(32,39,53,0.14)] p-4">
      <div
        role="status"
        aria-live="polite"
        className="flex w-[484px] max-w-full flex-col items-center rounded-xl border border-line bg-surface pt-7 pb-5 shadow-[0_12px_40px_rgba(32,39,53,0.15)] sm:pt-8 sm:pb-0"
      >
        <span
          aria-hidden
          className="size-8 rounded-full border-[3px] border-line border-t-accent border-r-accent motion-safe:animate-spin"
        />
        <div className="flex w-full flex-col gap-4 p-5 sm:gap-6 sm:p-6">
          <h2 className="text-center text-xl leading-[normal] font-semibold text-ink">Preparing your PDF…</h2>
          <div className="flex flex-col items-center gap-2 text-center text-muted">
            <p className="text-sm leading-[1.6]">We’re formatting your CV for download.</p>
            <p className="text-xs leading-[1.6] [overflow-wrap:anywhere]">{filename}</p>
          </div>
        </div>
        <div className="w-full px-5 sm:hidden">
          <button
            type="button"
            disabled
            className="h-11 w-full rounded-lg border border-accent bg-accent px-4 text-sm font-semibold text-white opacity-45"
          >
            Preparing…
          </button>
        </div>
      </div>
    </div>
  );
  return portal ? createPortal(overlay, document.body) : overlay;
}

/** True a moment after `active` turns on, and for a minimum time once it has shown. */
function useDelayedVisibility(active: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const [shownAt, setShownAt] = useState<number | null>(null);

  useEffect(() => {
    if (active) {
      const timer = setTimeout(() => {
        setShownAt(Date.now());
        setVisible(true);
      }, SHOW_AFTER_MS);
      return () => clearTimeout(timer);
    }
    if (!visible) {
      return;
    }
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - (shownAt ?? 0)));
    const timer = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [active, visible, shownAt]);

  return visible;
}
