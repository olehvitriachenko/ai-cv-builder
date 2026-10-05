"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { listCvs, type CvListItem } from "@/lib/api/cvs";
import { isApiError } from "@/lib/api/fetcher";
import { listPollInterval } from "@/lib/cv/list-poll";
import { CVS_QUERY_KEY } from "@/lib/cv/query-keys";
import { CvCard } from "./cv-card";
import { CvListEmpty } from "./cv-list-empty";

/**
 * The My CVs collection. The server already loaded the first list (`initialItems`); this keeps it
 * current: it refetches about every 5 seconds only while a listed CV is generating and stops as soon
 * as none is. Order is the server's (`updatedAt` descending); the client never re-sorts.
 */
export function CvList({ initialItems }: { initialItems: CvListItem[] }) {
  const router = useRouter();
  const query = useQuery({
    queryKey: CVS_QUERY_KEY,
    queryFn: async () => (await listCvs()).items,
    initialData: initialItems,
    refetchInterval: (current) => listPollInterval(current.state.data),
    retry: (count, error) => count < 3 && !isApiError(error, 401),
  });

  const sessionExpired = isApiError(query.error, 401);
  useEffect(() => {
    if (sessionExpired) {
      router.replace("/login");
    }
  }, [sessionExpired, router]);

  const items = query.data;

  if (items.length === 0) {
    return <CvListEmpty />;
  }

  return (
    <section aria-label="Your CVs" className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-3 text-[13px] leading-[normal] text-muted">
        <p className="font-medium">
          {items.length} {items.length === 1 ? "CV" : "CVs"}
        </p>
        {/* The list is always newest first; this is a label, not a control. */}
        <p className="flex items-center gap-2 font-normal">
          Last updated
          <ChevronDown aria-hidden className="size-3.5" strokeWidth={1.75} />
        </p>
      </div>

      {query.isError && !sessionExpired ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg bg-danger-tint p-3 text-[13px] text-danger sm:flex-row sm:items-center sm:justify-between"
        >
          <p>
            <span className="font-medium">Error: </span>
            We couldn’t refresh your CVs. What you see may be out of date.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            stretch={false}
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            {query.isFetching ? "Refreshing…" : "Try again"}
          </Button>
        </div>
      ) : null}

      <ul className="grid gap-4 md:grid-cols-2 md:gap-6">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <CvCard item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
