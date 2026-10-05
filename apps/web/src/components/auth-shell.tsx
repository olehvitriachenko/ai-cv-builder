import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

interface AuthShellProps {
  title: string;
  description: string;
  /** The other auth screen: "New to Forma?" + a link to it. */
  switchPrompt: string;
  switchLabel: string;
  switchHref: string;
  /** Small note under the card. */
  note: string;
  children: ReactNode;
}

/**
 * Shared frame of the Figma "01 · Авторизація" screens (login and register, desktop and mobile):
 * brand header, centred form card with intro and "switch" line, note, and footer.
 */
export function AuthShell({
  title,
  description,
  switchPrompt,
  switchLabel,
  switchHref,
  note,
  children,
}: AuthShellProps) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-[72px] shrink-0 items-center px-6 sm:h-24 sm:px-12 short:h-14">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent">
            <Image src="/brand/file-text.svg" alt="" width={19} height={19} unoptimized />
          </span>
          <span className="text-[21px] leading-[normal] font-bold text-ink">forma</span>
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center gap-6 px-4 py-6 sm:pt-10 [@media(min-height:900px)]:pt-[88px] short:gap-4 short:pt-6 short:pb-4">
        <Card className="flex w-full max-w-[432px] flex-col gap-6 p-6 sm:gap-8 sm:p-8 short:gap-6 short:p-6">
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl leading-[normal] font-semibold text-ink sm:text-[28px]">
              {title}
            </h1>
            <p className="text-sm leading-[1.6] text-muted">{description}</p>
          </div>
          {children}
          <p className="flex flex-wrap justify-center gap-x-2 text-[13px] leading-[normal]">
            <span className="text-muted">{switchPrompt}</span>
            <Link
              href={switchHref}
              className="rounded-sm font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {switchLabel}
            </Link>
          </p>
        </Card>
        <p className="w-full max-w-[400px] text-center text-xs leading-[1.6] text-muted">{note}</p>
      </main>

      <footer className="flex h-16 short:h-12 shrink-0 items-center justify-between px-6 text-xs leading-[normal] text-muted sm:px-12">
        <span>© {new Date().getFullYear()} Forma</span>
        <span>Privacy policy</span>
      </footer>
    </div>
  );
}
