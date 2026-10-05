"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/**
 * Figma "CV / section" card: a heading with a count, a one-line overview while collapsed and the
 * form controls while open. Collapsed fields stay registered in the form, so nothing is lost.
 */
export function SectionCard({
  title,
  meta,
  overview,
  defaultOpen = false,
  children,
}: {
  title: string;
  meta?: string;
  overview: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section
      aria-label={title}
      className={`flex flex-col gap-3 rounded-xl border bg-surface p-4 ${open ? "border-accent-line" : "border-line"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-baseline gap-2 text-sm font-semibold text-ink">
          {title}
          {meta ? <span className="text-[11px] font-normal text-muted">{meta}</span> : null}
        </h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? `Collapse ${title}` : `Edit ${title}`}
          onClick={() => setOpen((value) => !value)}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {open ? (
            <ChevronUp aria-hidden className="size-3.5" strokeWidth={1.75} />
          ) : (
            <ChevronDown aria-hidden className="size-3.5" strokeWidth={1.75} />
          )}
        </button>
      </div>
      {open ? null : <div className="text-xs leading-[1.5] break-words text-muted">{overview}</div>}
      <div id={bodyId} hidden={!open} className="flex flex-col gap-4">
        {children}
      </div>
    </section>
  );
}
