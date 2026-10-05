import type { ReactNode } from "react";

/**
 * "Section card" of the structured editor (Figma 05.1/06.1): always open, 16px padding, a 16px
 * semibold heading and an optional 11px count line. No accordion: every section is visible.
 */
export function SectionCard({
  title,
  count,
  children,
}: {
  title: string;
  count?: string | null;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
      <header className="flex flex-col gap-2">
        <h3 className="text-base leading-[normal] font-semibold text-ink">{title}</h3>
        {count ? <p className="text-[11px] leading-normal text-muted">{count}</p> : null}
      </header>
      {children}
    </section>
  );
}
