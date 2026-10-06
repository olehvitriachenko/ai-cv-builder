"use client";

import type { ReactNode } from "react";
import { AppHeader } from "@/app/_components/app-header";
import { useCurrentUser } from "../../features/auth/providers/user-context";

/**
 * The page frame of My CVs, the create flow, generation and the error states: the app header and
 * the main landmark. The structured editor is the one screen that does not use it, because it
 * brings its own sticky navigation.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const user = useCurrentUser();

  return (
    <>
      <AppHeader user={user} />
      <main className="flex w-full flex-1 flex-col">{children}</main>
    </>
  );
}
