"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import type { User } from "@/features/auth/api";

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

/**
 * Figma "Account menu": account name, avatar and a chevron on desktop, the avatar alone on mobile.
 * It opens a small panel with the signed-in email and Sign out. Escape or a click outside closes it.
 */
export function AccountMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <span className="hidden max-w-60 min-w-0 truncate text-[13px] text-muted sm:block">
          {user.email}
        </span>
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent"
        >
          {initials(user.email)}
        </span>
        <ChevronDown aria-hidden className="hidden size-4 shrink-0 text-muted sm:block" strokeWidth={1.75} />
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute top-full right-0 z-10 mt-3 flex w-64 max-w-[calc(100vw-3rem)] flex-col gap-3 rounded-xl border border-line bg-surface p-4"
        >
          <p className="text-[13px] [overflow-wrap:anywhere] text-muted">
            Signed in as <span className="font-medium text-ink">{user.email}</span>
          </p>
          <SignOutButton />
        </div>
      ) : null}
    </div>
  );
}
