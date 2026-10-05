"use client";

import { useEffect, useState } from "react";
import { computeCompleteness } from "@/lib/cv/completeness";
import type { DraftFormValues } from "@/lib/cv/draft-form";

/** How long the score must stay unchanged before it is announced (no chatter while typing). */
const ANNOUNCE_AFTER_MS = 1200;

/**
 * "CV completeness" (Figma 05.1): the advisory score of the spec appendix, a progress track and the
 * missing items with their gains. It follows every keystroke, never blocks saving, and the live
 * region announces only a settled value.
 */
export function CompletenessCard({ values }: { values: DraftFormValues }) {
  const { percent, missing } = computeCompleteness(values);
  const left = missing.length;

  const summary =
    left === 0 ? "CV complete" : `${percent}% complete, ${left} ${left === 1 ? "item" : "items"} left`;
  const [announced, setAnnounced] = useState(summary);
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(summary), ANNOUNCE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [summary]);

  return (
    <section aria-label="CV completeness" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-xs leading-[normal] font-semibold text-ink">CV completeness</p>
          {left > 0 ? (
            <span className="rounded-full bg-warning-tint px-2 py-[3px] text-[10px] leading-[normal] font-semibold whitespace-nowrap text-warning">
              Needs details · {left} left
            </span>
          ) : (
            <span className="rounded-full bg-success-tint px-2 py-[3px] text-[10px] leading-[normal] font-semibold whitespace-nowrap text-success">
              Complete
            </span>
          )}
        </div>
        <p className="shrink-0 text-xs leading-[normal] font-semibold text-accent">{percent}% complete</p>
      </div>
      <div
        role="progressbar"
        aria-label="CV completeness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1 w-full rounded-full bg-stage"
      >
        <div className="h-1 rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
      {left > 0 ? (
        <ul aria-label="Missing details" className="flex flex-wrap gap-1.5">
          {missing.map((item) => (
            <li
              key={item.id}
              className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] leading-[normal] text-muted"
            >
              +{item.gain}% {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {announced}
      </p>
    </section>
  );
}
