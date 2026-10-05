import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The sticky editor navigation (Figma 05.1, redlines in 11.2): 80 px high in every state on
 * desktop, 32 px side padding, controls of at least 44 px, a one-line title that truncates, and
 * the document identity (target role and owner). The save state, Download PDF and the
 * more-options menu are passed in, so this component only lays them out.
 *
 * Below `sm` the identity and the save state move to a second row and the wordmark and breadcrumb
 * are dropped (the menu has Back to My CVs), so nothing scrolls sideways. The designed phone
 * header belongs to the phone-layout story.
 */
export function EditorNav({
  title,
  owner,
  status,
  actions,
}: {
  title: string;
  owner: string;
  status: ReactNode;
  actions: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-3 sm:h-20 sm:flex-nowrap sm:gap-x-6 sm:px-8 sm:py-0">
      <Link
        href="/cvs"
        aria-label="My CVs"
        className="flex shrink-0 items-center gap-[9px] rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent">
          <Image src="/brand/file-text.svg" alt="" width={19} height={19} unoptimized />
        </span>
        <span className="hidden text-[21px] leading-[normal] font-bold text-ink sm:inline">forma</span>
      </Link>
      <span aria-hidden className="hidden h-6 w-px shrink-0 bg-line sm:block" />
      <Link
        href="/cvs"
        className="hidden h-11 shrink-0 items-center gap-1 rounded-lg text-[13px] leading-[normal] font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex"
      >
        <span aria-hidden className="text-[11px] text-muted">
          ←
        </span>
        My CVs
      </Link>
      <div className="order-last flex min-w-0 basis-full items-center gap-3 sm:contents">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 title={title} className="truncate text-base leading-[normal] font-semibold text-ink">
            {title}
          </h1>
          <p className="truncate text-[11px] leading-[normal] text-muted">{owner}</p>
        </div>
        {status}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3 sm:ml-0 sm:gap-6">{actions}</div>
    </header>
  );
}
