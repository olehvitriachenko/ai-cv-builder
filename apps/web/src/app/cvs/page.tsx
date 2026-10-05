import { LockKeyhole, Plus } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { isApiError } from "@/lib/api/fetcher";
import { listCvsServer } from "@/lib/cv/server";
import { CvList } from "./cv-list";
import { CvListSkeleton } from "./cv-list-skeleton";

export const metadata: Metadata = { title: "My CVs · AI CV Builder" };

/** The first list, loaded on the server with the session cookie, then handed to the client list. */
async function InitialCvList() {
  let list;
  try {
    list = await listCvsServer();
  } catch (error) {
    // A convenience redirect only: the API enforces authentication on every request.
    if (isApiError(error, 401)) {
      redirect("/login");
    }
    throw error;
  }

  return <CvList initialItems={list.items} />;
}

/**
 * My CVs: the authenticated landing page. The heading renders at once; the list streams in behind
 * a skeleton, then the client list keeps it fresh (polling only while a CV is generating).
 */
export default function MyCvsPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-8 px-6 pt-8 pb-12 sm:px-12 sm:pt-12 lg:px-24">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="text-[28px] leading-tight font-semibold text-ink sm:text-[30px]">My CVs</h1>
          <p className="text-sm leading-normal text-muted">
            Your experience. Ready for the right opportunity.
          </p>
        </div>
        <ButtonLink href="/cvs/new">
          <Plus aria-hidden className="size-4" strokeWidth={1.75} />
          Create CV
        </ButtonLink>
      </div>

      <Suspense fallback={<CvListSkeleton />}>
        <InitialCvList />
      </Suspense>

      <p className="flex items-center gap-2 text-xs leading-normal text-muted">
        <LockKeyhole aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />
        Your CVs are private. Only you can access and download them.
      </p>
    </div>
  );
}
