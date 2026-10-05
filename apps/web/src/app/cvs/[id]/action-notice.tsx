"use client";

import { useEffect, useState } from "react";

import { expireActionFeedback } from "@/lib/cv/action-feedback";
const FADE_MS = 200;

/** Only success feedback expires; messages that need attention remain visible. */
export function ActionNotice({ message, transient }: { message: string; transient: boolean }) {
  const [leaving, setLeaving] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    if (!transient) return;
    let removal: number | undefined;
    const cancelExpiry = expireActionFeedback(() => {
      setLeaving(true);
      removal = window.setTimeout(() => setRemoved(true), FADE_MS);
    });
    return () => {
      cancelExpiry();
      window.clearTimeout(removal);
    };
  }, [transient]);

  if (removed) return null;
  return (
    <div className={`grid motion-safe:transition-[grid-template-rows,opacity,transform,margin-bottom] motion-safe:duration-200 motion-safe:ease-out ${leaving ? "-mb-4 grid-rows-[0fr] -translate-y-1 opacity-0" : "grid-rows-[1fr] opacity-100 motion-safe:starting:grid-rows-[0fr] motion-safe:starting:opacity-0"}`}>
      <div className="min-h-0 overflow-hidden">
        <p role="status" className="rounded-lg bg-canvas p-3 text-[13px] leading-normal text-ink">{message}</p>
      </div>
    </div>
  );
}
