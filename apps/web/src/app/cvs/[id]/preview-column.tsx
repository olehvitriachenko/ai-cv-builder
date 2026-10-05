import { CvDocument } from "./cv-document";
import type { CvDraft } from "@/lib/api/cvs";

/**
 * The live A4 preview (Figma 05.1): a permanent sticky column beside the editor on desktop, below
 * the navigation. The stage scrolls inside the column when the document is taller than the
 * window, so the whole page stays reachable while the column stays in view. Zoom, the status line
 * and full screen come with the preview-controls story.
 */
export function PreviewColumn({ draft, targetRole, className }: { draft: CvDraft; targetRole: string; className: string }) {
  return (
    <section aria-label="Live preview" className={`${className} min-w-0 flex-1 flex-col gap-3 lg:sticky lg:top-28`}>
      <div className="flex items-center gap-3">
        <h2 className="text-sm leading-[normal] font-semibold text-ink">Preview</h2>
        <p className="text-[11px] leading-[normal] text-muted">Classic · A4</p>
      </div>
      <div className="flex flex-col items-center rounded-xl bg-stage p-4 sm:p-6 lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto">
        <CvDocument draft={draft} targetRole={targetRole} />
      </div>
    </section>
  );
}
