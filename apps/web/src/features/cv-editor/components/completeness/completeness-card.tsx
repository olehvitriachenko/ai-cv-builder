"use client";

import { useEffect, useState } from "react";
import { computeCompleteness } from "@/features/cv-editor/model/completeness";
import { revealMissingItem } from "../../lib/section-links";
import type { DraftFormValues } from "@/features/cv-editor/model/draft-form";
import { useEditorMotion } from "@/shared/lib/use-editor-motion";

/** What to do for a missing item, as the phone layout lists it ("+10% · Add phone number"). */
function actionLabel(item: { id: string; label: string }): string {
  switch (item.id) {
    case "linkedin":
      return "Add LinkedIn URL";
    case "skills":
      return "Add at least 5 skills";
    default:
      return `Add ${item.label.toLowerCase()}`;
  }
}

/** How long the score must stay unchanged before it is announced (no chatter while typing). */
const ANNOUNCE_AFTER_MS = 1200;

/**
 * "CV completeness" (Figma 05.1): the advisory score of the spec appendix, a progress track and the
 * missing items with their gains. It follows every keystroke, never blocks saving, and the live
 * region announces only a settled value.
 */
export function CompletenessCard({ values }: { values: DraftFormValues }) {
  const desktopMotionRef = useEditorMotion<HTMLUListElement>();
  const mobileMotionRef = useEditorMotion<HTMLUListElement>();
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
    <section aria-label="CV completeness" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 sm:px-4 sm:py-3">
      {/* Phone (Figma 320 px editor): the percentage in one badge, the track, then what is missing. */}
      <div className="flex flex-col gap-2.5 sm:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-sm leading-[normal] font-semibold text-ink">CV completeness</p>
          <span
            className={`shrink-0 rounded-full px-2.5 py-[3px] text-xs leading-[normal] font-bold whitespace-nowrap ${
              left === 0 ? "bg-success-tint text-success" : percent === 0 ? "bg-canvas text-muted" : "bg-accent-tint text-accent"
            }`}
          >
            {left === 0 ? "Ready for PDF" : percent === 0 ? "Not started" : `${percent}% complete`}
          </span>
        </div>
        <div role="progressbar" aria-label="CV completeness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 w-full rounded-full bg-stage">
          <div className="h-1.5 rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
        {left > 0 ? (
          <div className="flex flex-col gap-1">
            <p className="text-[11px] leading-[normal] font-semibold text-ink">Needs details · {left} left</p>
            <ul ref={mobileMotionRef} aria-label="Missing details" className="flex flex-col">
              {missing.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => revealMissingItem(item.id)} className="flex min-h-6 w-full items-center gap-1.5 rounded text-left text-[11px] leading-[normal] text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-safe:transition-colors">
                    <span aria-hidden className="size-1 shrink-0 rounded-full bg-accent" />+{item.gain}% · {actionLabel(item)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="hidden items-center justify-between gap-3 sm:flex">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-xs leading-[normal] font-semibold text-ink">CV completeness</p>
          {left === 0 ? (
            <span className="rounded-full bg-success-tint px-2 py-[3px] text-[10px] leading-[normal] font-semibold whitespace-nowrap text-success">
              Ready for PDF
            </span>
          ) : percent === 0 ? (
            <span className="rounded-full bg-canvas px-2 py-[3px] text-[10px] leading-[normal] font-semibold whitespace-nowrap text-muted">
              Not started
            </span>
          ) : (
            <span className="rounded-full bg-warning-tint px-2 py-[3px] text-[10px] leading-[normal] font-semibold whitespace-nowrap text-warning">
              Needs details · {left} left
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
        className="hidden h-1 w-full rounded-full bg-stage sm:block"
      >
        <div className="h-1 rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
      {left > 0 ? (
        <ul ref={desktopMotionRef} aria-label="Missing details" className="hidden flex-wrap gap-1.5 sm:flex">
          {missing.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => revealMissingItem(item.id)} aria-label={actionLabel(item)} className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] leading-[normal] text-muted hover:border-accent-line hover:bg-accent-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-safe:transition-colors">
                +{item.gain}% {item.label}
              </button>
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
