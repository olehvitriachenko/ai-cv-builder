import { FileText } from "lucide-react";
import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { AccountMenu } from "@/components/account-menu";
import type { User } from "@/lib/api/auth";

/**
 * App header from the Figma "App navigation": product mark, the "My CVs" item (desktop only, as in
 * the mobile frame) and the account menu (which holds sign out).
 */
export function AppHeader({ user }: { user: User }) {
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-6 lg:px-12">
      <nav aria-label="Main" className="flex items-center gap-12">
        <Link href="/cvs" className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent">
            <FileText aria-hidden className="size-[19px] text-white" strokeWidth={1.75} />
          </span>
          <span className="text-[21px] leading-none font-bold text-ink">forma</span>
        </Link>
        <div className="hidden sm:block">
          <NavLink href="/cvs">My CVs</NavLink>
        </div>
      </nav>
      <AccountMenu user={user} />
    </header>
  );
}
