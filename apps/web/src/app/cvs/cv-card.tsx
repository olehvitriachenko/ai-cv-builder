"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DisplayStatusBadge } from "@/components/ui/status-badge";
import { retryCv, type CvListItem } from "@/lib/api/cvs";
import { isApiError } from "@/lib/api/fetcher";
import { cardActions, cardMessage, cardName, formatUpdated } from "@/lib/cv/card-copy";
import { CVS_QUERY_KEY } from "@/lib/cv/query-keys";

const MESSAGE_TONE: Record<CvListItem["displayStatus"], string> = {
  DRAFT: "text-accent",
  FAILED: "text-danger",
  PROCESSING: "text-muted",
  COMPLETED: "text-muted",
};

function retryErrorMessage(error: unknown): string {
  if (isApiError(error, 409)) {
    return "This CV can’t be retried right now. The list has been refreshed.";
  }
  return "We couldn’t restart the generation. Try again in a moment.";
}

/** Figma "CV card": document symbol, status badge, name, role, time, message and actions. */
export function CvCard({ item }: { item: CvListItem }) {
  const queryClient = useQueryClient();
  const actions = cardActions(item);
  const href = `/cvs/${encodeURIComponent(item.id)}`;

  const retry = useMutation({
    mutationFn: () => retryCv(item.id),
    // Success moves the CV to PENDING; a conflict means the list was stale. Either way, refresh.
    onSettled: () => queryClient.invalidateQueries({ queryKey: CVS_QUERY_KEY }),
  });

  return (
    <Card className="flex h-full flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-canvas">
          <FileText aria-hidden className="size-5 text-muted" strokeWidth={1.75} />
        </span>
        <DisplayStatusBadge status={item.displayStatus} />
      </div>

      <div className="flex min-w-0 flex-col gap-2 [overflow-wrap:anywhere]">
        <p className="text-[13px] text-muted">{cardName(item)}</p>
        <h2 className="text-lg leading-[1.4] font-semibold text-ink">{item.targetRole}</h2>
        <p className="text-xs text-muted">
          Updated{" "}
          <time dateTime={item.updatedAt} suppressHydrationWarning>
            {formatUpdated(item.updatedAt)}
          </time>
        </p>
        <p className={`text-xs leading-normal ${MESSAGE_TONE[item.displayStatus]}`}>
          {cardMessage(item)}
        </p>
      </div>

      <div className="h-px bg-line" />

      <div className="mt-auto flex flex-col gap-3">
        {retry.isError ? (
          <p role="alert" className="rounded-lg bg-danger-tint p-3 text-[13px] text-danger">
            <span className="font-medium">Error: </span>
            {retryErrorMessage(retry.error)}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {actions.primary === "open" ? (
            <ButtonLink href={href} variant="secondary" size="compact" stretch={false}>
              Open
            </ButtonLink>
          ) : null}
          {actions.primary === "progress" ? (
            <ButtonLink href={href} variant="secondary" size="compact" stretch={false}>
              View progress
            </ButtonLink>
          ) : null}
          {actions.primary === "retry" ? (
            <Button
              type="button"
              variant="secondary"
              size="compact"
              stretch={false}
              onClick={() => retry.mutate()}
              disabled={retry.isPending}
            >
              {retry.isPending ? "Restarting…" : "Try again"}
            </Button>
          ) : null}
          {actions.downloadPdf === "disabled" ? (
            <Button
              type="button"
              variant="secondary"
              size="compact"
              stretch={false}
              disabled
              title="PDF export is coming soon"
            >
              Download PDF
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
