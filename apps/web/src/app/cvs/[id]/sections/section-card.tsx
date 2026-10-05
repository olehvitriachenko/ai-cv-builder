import type { ReactNode } from "react";

/**
 * "Section card" of the structured editor (Figma 05.1/06.1): always open, 16px padding, a 16px
 * semibold heading and an optional 11px count line. No accordion: every section is visible.
 */
export function SectionCard({
  id,
  title,
  count,
  aside,
  children,
}: {
  /** The anchor the AI assistant's "Review section" actions scroll to. */
  id?: string;
  title: string;
  count?: string | null;
  /** A short note at the right end of the title row (for example "6 skills · By category"). */
  aside?: string | null;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className="flex scroll-mt-24 flex-col gap-4 rounded-xl border border-line bg-surface p-4 [&_button]:scroll-mt-24 [&_input]:scroll-mt-24 [&_select]:scroll-mt-24 [&_textarea]:scroll-mt-24">
      <header className="flex flex-col gap-2">
        {aside ? (
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base leading-[normal] font-semibold text-ink">{title}</h3>
            <p className="shrink-0 text-[11px] leading-[normal] text-muted">{aside}</p>
          </div>
        ) : (
          <h3 className="text-base leading-[normal] font-semibold text-ink">{title}</h3>
        )}
        {count ? <p className="text-[11px] leading-normal text-muted">{count}</p> : null}
      </header>
      {children}
    </section>
  );
}
