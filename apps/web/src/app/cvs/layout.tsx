import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/features/auth/server";
import { QueryProvider } from "../../shared/providers/query-provider";
import { UserProvider } from "../../features/auth/providers/user-context";

/**
 * Shared shell for the CV screens: authentication, the signed-in user and the query client. The
 * header and the main landmark come from each page (`AppShell`), because the editor has its own
 * navigation. The redirect is a convenience only: the API enforces authentication on every request,
 * including the page's own data calls.
 */
export default async function CvsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <UserProvider user={user}>
      <QueryProvider>{children}</QueryProvider>
    </UserProvider>
  );
}
