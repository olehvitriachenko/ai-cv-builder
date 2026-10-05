import { FileText } from "lucide-react";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import type { User } from "@/lib/api/auth";

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

/**
 * Minimal app header from the Figma "App navigation": product mark, account avatar and sign out.
 * The "My CVs" navigation item is not part of this feature (there is no CV list yet).
 */
export function AppHeader({ user }: { user: User }) {
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 sm:px-8 lg:px-12">
      <Link href="/" className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent">
          <FileText aria-hidden className="size-[19px] text-white" strokeWidth={1.75} />
        </span>
        <span className="text-[21px] leading-none font-bold text-ink">forma</span>
      </Link>
      <div className="flex min-w-0 items-center gap-3">
        <span className="hidden min-w-0 truncate text-[13px] text-muted sm:block" title={user.email}>
          {user.email}
        </span>
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent"
        >
          {initials(user.email)}
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}
