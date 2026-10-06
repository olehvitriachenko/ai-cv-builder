"use client";

import { TriangleAlert, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  diffSections,
  reviewSummary,
  versionHeading,
  type ReviewSection,
  type SectionSide,
  type VersionContent,
} from "@/lib/cv/conflict-review";

function Side({ sectionSide, changed }: { sectionSide: SectionSide; changed: boolean }) {
  return (
    <>
      <p className={`text-xs leading-normal ${changed ? "text-accent" : "text-muted"}`}>{sectionSide.status}</p>
      {sectionSide.lines.map((line, index) => (
        <p
          key={`${index}-${line}`}
          className={`text-xs leading-normal break-words text-ink ${line.startsWith("•") ? "pl-0.5" : ""}`}
        >
          {line}
        </p>
      ))}
    </>
  );
}

function SectionCard({ section, side }: { section: ReviewSection; side: "local" | "saved" }) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg p-3 ${
        section.changed ? "border-[1.5px] border-accent bg-[#f2f2fd]" : "border border-line bg-surface"
      }`}
    >
      <h4 className="text-[13px] leading-[normal] font-semibold text-ink [overflow-wrap:anywhere]">{section.title}</h4>
      <Side sectionSide={section[side]} changed={section.changed} />
    </div>
  );
}

function Version({
  title,
  subtitle,
  version,
  sections,
  side,
}: {
  title: string;
  subtitle: string;
  version: VersionContent;
  sections: ReviewSection[];
  side: "local" | "saved";
}) {
  const heading = versionHeading(version);
  return (
    <section
      aria-label={title}
      // The comparison scrolls with the dialog; it is focusable so the keyboard can reach it first.
      tabIndex={0}
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-lg leading-[normal] font-semibold text-ink">{title}</h3>
        <p className="text-[11px] leading-normal text-muted">{subtitle}</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xl leading-[normal] font-semibold text-ink [overflow-wrap:anywhere]">{heading.name}</p>
        <p className="text-xs leading-normal text-muted [overflow-wrap:anywhere]">{heading.role}</p>
      </div>
      {sections.map((section) => (
        <SectionCard key={section.key} section={section} side={side} />
      ))}
    </section>
  );
}

/**
 * "Review conflicting versions" (Figma 09.3 to 09.5) on a native `<dialog>`: the person's unsaved
 * document and the newer saved one, side by side on a wide screen and stacked on a phone, with
 * the differing sections marked. There is **no preselected choice** and nothing is merged or
 * overwritten until **Keep my version** or **Use saved version** is pressed. Escape, Close and
 * Cancel keep the draft and return focus to what opened the review. Tab order: Close, the two
 * comparisons, Keep my version, Use saved version, Cancel.
 */
export function ConflictReview({
  local,
  saved,
  onKeepMine,
  onUseSaved,
  onClose,
}: {
  local: VersionContent;
  saved: VersionContent;
  onKeepMine: () => void;
  onUseSaved: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const sections = diffSections(local, saved);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const requestClose = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-canvas p-0 text-ink backdrop:bg-ink/40 open:flex open:flex-col sm:m-auto sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[1120px] sm:rounded-xl sm:border sm:border-line"
    >
      <div className="relative flex shrink-0 flex-col gap-3 border-b border-line bg-surface p-4 pr-16 sm:p-6 sm:pr-20">
        <h2 id={titleId} className="text-xl leading-tight font-semibold text-ink sm:text-2xl">
          Review conflicting versions
        </h2>
        <p className="text-sm leading-[1.6] text-muted">
          A newer saved version is available. Compare it with your local changes. Nothing is overwritten until you
          choose a version.
        </p>
        <button
          type="button"
          aria-label="Close"
          onClick={requestClose}
          className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-lg text-muted hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:top-5 sm:right-5"
        >
          <X aria-hidden className="size-5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
        <p className="flex items-start gap-1.5 text-xs leading-normal text-accent">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
          {reviewSummary(sections)}
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start md:gap-6">
          <Version
            title="Local changes"
            subtitle="Draft on this device · not yet synced"
            version={local}
            sections={sections}
            side="local"
          />
          <Version
            title="Saved version"
            subtitle="Last saved revision · comparison only"
            version={saved}
            sections={sections}
            side="saved"
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="button" variant="secondary" stretch={false} className="w-full text-accent! sm:w-auto" onClick={onKeepMine}>
            Keep my version
          </Button>
          <Button type="button" variant="secondary" stretch={false} className="w-full text-accent! sm:w-auto" onClick={onUseSaved}>
            Use saved version
          </Button>
          <Button type="button" variant="secondary" stretch={false} className="w-full text-accent! sm:w-auto" onClick={requestClose}>
            Cancel
          </Button>
        </div>
        <p className="text-xs leading-normal text-muted">
          No version preselected. Keep my version saves your local draft over the latest saved version; Use saved
          version discards your local edits. Cancel keeps your draft and changes nothing.
        </p>
      </div>
    </dialog>
  );
}
