import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The sticky editor navigation (Figma 05.1, 05.2, 05.3, redlines in 11.2). Desktop: one row, 80 px
 * high in every state, 32 px side padding, the wordmark and "My CVs", the document identity (title
 * and owner), the save status and the actions. Phone: **112 px in every state** (16 top, a 44 px
 * row of wordmark, "My CVs" and the actions, 8 gap, a 28 px row of the title and the save status,
 * 16 bottom), 16 px side padding, the title on one line with an ellipsis. Every control is at
 * least 44 px. The status and the actions are passed in, so this component only lays them out.
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
    <header className="sticky top-0 z-20 h-28 shrink-0 border-b border-line bg-surface sm:h-20">
      <div className="flex h-full flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-6 sm:px-8 sm:py-0">
        <div className="flex h-11 shrink-0 items-center gap-3 sm:contents">
          <Link
            href="/cvs"
            aria-label="My CVs"
            className="flex h-11 shrink-0 items-center gap-[9px] rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent">
              <Image src="/brand/file-text.svg" alt="" width={19} height={19} unoptimized />
            </span>
            <span className="hidden text-[21px] leading-[normal] font-bold text-ink min-[360px]:inline">forma</span>
          </Link>
          <span aria-hidden className="hidden h-6 w-px shrink-0 bg-line sm:block" />
          <Link
            href="/cvs"
            className="flex h-11 shrink-0 items-center gap-1 rounded-lg text-[13px] leading-[normal] font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span aria-hidden className="text-[11px] text-muted">
              ←
            </span>
            My CVs
          </Link>
          <div className="hidden min-w-0 flex-1 flex-col gap-1 sm:flex">
            <h1 title={title} className="truncate text-base leading-[normal] font-semibold text-ink">
              {title}
            </h1>
            <p className="truncate text-[11px] leading-[normal] text-muted">{owner}</p>
          </div>
          <div className="hidden shrink-0 sm:block">{status}</div>
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0 sm:gap-6">{actions}</div>
        </div>
        {/* Phone second row: the title and the save status, 28 px. */}
        <div className="flex h-7 items-center gap-3 sm:hidden">
          <p title={title} className="min-w-0 flex-1 truncate text-sm leading-5 font-semibold text-ink">
            {title}
          </p>
          <div className="shrink-0">{status}</div>
        </div>
      </div>
    </header>
  );
}
