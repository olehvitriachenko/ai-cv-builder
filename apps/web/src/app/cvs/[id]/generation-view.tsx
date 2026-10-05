"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiError, isApiError } from "@/lib/api/fetcher";
import { getCvStatus, retryCv, type CvStatus } from "@/lib/api/cvs";
import { pollInterval } from "@/lib/cv/poll";
import { CvNotFound } from "./cv-not-found";
import { DraftSkeleton } from "./draft-skeleton";
import { GenerationIntro, GenerationProgress } from "./generation-progress";

const TITLES = {
  PENDING: "Getting your CV ready",
  PROCESSING: "Putting your experience into words",
  FAILED: "We couldn’t finish your draft",
} as const;

function retryErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.code === "GENERATION_NOT_RETRYABLE"
    ? "This CV can’t be retried right now because its status has changed. We’re refreshing it."
    : "We couldn’t start the retry. Please try again.";
}

/**
 * The persisted generation state of one CV. The server renders the first status; from there
 * TanStack Query polls (only while PENDING or PROCESSING), fetches the result once on COMPLETED,
 * and retries through a mutation. A reload rebuilds everything from the API: no progress lives
 * only in the browser.
 */
export function GenerationView({ initialStatus }: { initialStatus: CvStatus }) {
  const id = initialStatus.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const statusKey = ["cv", id, "status"] as const;

  const statusQuery = useQuery({
    queryKey: statusKey,
    queryFn: () => getCvStatus(id),
    initialData: initialStatus,
    refetchInterval: (query) => pollInterval(query.state.data?.status),
    retry: (count, error) => count < 3 && !isApiError(error, 401) && !isApiError(error, 404),
  });
  const status = statusQuery.data;

  const retryMutation = useMutation({
    mutationFn: () => retryCv(id),
    onSuccess: (next) => {
      // Show PENDING at once, then let the status query pick polling back up.
      queryClient.setQueryData(statusKey, next);
      void queryClient.invalidateQueries({ queryKey: statusKey });
    },
    onError: (error) => {
      if (isApiError(error, 401)) {
        router.replace("/login");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: statusKey });
    },
  });

  // The generation just finished: the server page renders the editor for a COMPLETED CV.
  const completed = status.status === "COMPLETED";
  useEffect(() => {
    if (completed) {
      router.refresh();
    }
  }, [completed, router]);

  const sessionExpired = isApiError(statusQuery.error, 401);
  useEffect(() => {
    if (sessionExpired) {
      router.replace("/login");
    }
  }, [sessionExpired, router]);

  if (isApiError(statusQuery.error, 404)) {
    return <CvNotFound />;
  }

  if (status.status === "COMPLETED") {
    return (
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-4 py-8 sm:px-8 lg:px-12">
        <p role="status" className="text-sm text-muted">
          Your CV is ready. Opening the editor…
        </p>
        <DraftSkeleton caption="Your draft is ready" note="Opening the editor…" />
      </div>
    );
  }

  const failed = status.status === "FAILED";
  const connectionTrouble = statusQuery.isError && !failed;

  return (
    <div className="mx-auto flex w-full max-w-[1008px] flex-col gap-6 px-6 pt-6 pb-8 sm:gap-8 sm:pt-14 sm:pb-16">
      <GenerationIntro
        badge={<StatusBadge status={status.status} />}
        title={TITLES[status.status]}
        role={status.targetRole}
      />
      {/* Announces progress changes to assistive technology without stealing focus. */}
      <p role="status" className="sr-only">
        {failed
          ? "Generation failed."
          : status.status === "PROCESSING"
            ? "Your CV is being generated."
            : "Your CV is waiting to start."}
      </p>
      {connectionTrouble ? (
        <p role="status" className="rounded-lg bg-canvas p-3 text-[13px] text-muted">
          Having trouble reaching the server. We’ll keep trying.
        </p>
      ) : null}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <GenerationProgress
          status={status}
          onRetry={() => retryMutation.mutate()}
          retrying={retryMutation.isPending}
          retryError={retryMutation.isError ? retryErrorMessage(retryMutation.error) : null}
        />
        <div className="hidden lg:block">
          <DraftSkeleton
            caption={failed ? "Draft not created yet" : "Your CV is taking shape"}
            note={failed ? "Retry to build your editable draft." : "You’ll be able to edit every section next."}
          />
        </div>
      </div>
    </div>
  );
}
