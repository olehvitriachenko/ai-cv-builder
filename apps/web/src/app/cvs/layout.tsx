import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { getCurrentUser } from "@/lib/auth/server";
import { QueryProvider } from "./query-provider";

/**
 * Shared shell for the CV screens. The redirect is a convenience only: the API enforces
 * authentication on every request, including the page's own data calls.
 */
export default async function CvsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <AppHeader user={user} />
      <main className="flex w-full flex-1 flex-col">
        <QueryProvider>{children}</QueryProvider>
      </main>
    </>
  );
}
