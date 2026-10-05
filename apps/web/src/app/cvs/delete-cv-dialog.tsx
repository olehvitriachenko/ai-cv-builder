"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteCv, type CvListItem } from "@/lib/api/cvs";
import { deleteOutcome, deleteSubject } from "@/lib/cv/delete-flow";
import { CVS_QUERY_KEY } from "@/lib/cv/query-keys";

/**
 * Figma "Delete confirmation" dialog on the native `<dialog>`: modal, Escape closes it, focus is
 * trapped while open and returns to the Delete button on close. Mounted only while confirming.
 */
export function DeleteCvDialog({ item, onClose }: { item: CvListItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // Closing through the element (not by unmounting) lets the browser return focus to the Delete
  // button; its `close` event then tells the card to unmount the dialog.
  const requestClose = () => ref.current?.close();

  const remove = useMutation({
    mutationFn: () => deleteCv(item.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CVS_QUERY_KEY });
      requestClose();
    },
    onError: (error) => {
      const outcome = deleteOutcome(error);
      // The list may be stale either way (already gone, or generating again): refresh it.
      void queryClient.invalidateQueries({ queryKey: CVS_QUERY_KEY });
      if (outcome.kind === "gone") {
        requestClose();
        return;
      }
      setMessage(outcome.message);
    },
  });

  return (
    <dialog
      ref={ref}
      aria-labelledby={`delete-title-${item.id}`}
      onClose={onClose}
      onCancel={(event) => {
        // Escape must not close the dialog while the deletion request is in flight.
        if (remove.isPending) {
          event.preventDefault();
        }
      }}
      className="m-auto w-[min(484px,calc(100vw-32px))] rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
    >
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id={`delete-title-${item.id}`} className="text-xl font-semibold text-ink">
            Delete this CV?
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={requestClose}
            disabled={remove.isPending}
            className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
          >
            <X aria-hidden className="size-[18px]" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex flex-col gap-4 text-sm leading-[1.6] text-muted [overflow-wrap:anywhere]">
          <p>{deleteSubject(item)}</p>
          <p>This permanently deletes the CV and its answers. You can’t undo this action.</p>
        </div>

        {message ? (
          <p role="alert" className="rounded-lg bg-danger-tint p-3 text-[13px] text-danger">
            <span className="font-medium">Error: </span>
            {message}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={requestClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setMessage(null);
              remove.mutate();
            }}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Deleting…" : "Delete CV"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
