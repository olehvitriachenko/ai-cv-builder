"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { deleteCv } from "@/features/cv-delete/api";
import { deleteOutcome } from "@/features/cv-delete/model/delete-flow";
import { CVS_QUERY_KEY } from "@/lib/cv/query-keys";

/**
 * Figma "Delete confirmation" dialog on the native `<dialog>`: modal, Escape closes it, focus is
 * trapped while open and returns to the Delete button on close. Mounted only while confirming.
 * Used by My CVs cards and by the editor's more-options menu; `onDeleted` runs once the CV is gone
 * (deleted now, or already gone), so the editor can leave a page that no longer has a CV.
 */
export function DeleteCvDialog({
  cvId,
  subject,
  onClose,
  onDeleted,
}: {
  cvId: string;
  /** What the dialog names, for example "Alex Morgan · Senior Engineer". */
  subject: string;
  onClose: () => void;
  onDeleted?: () => void;
}) {
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
    mutationFn: () => deleteCv(cvId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CVS_QUERY_KEY });
      requestClose();
      onDeleted?.();
    },
    onError: (error) => {
      const outcome = deleteOutcome(error);
      // The list may be stale either way (already gone, or generating again): refresh it.
      void queryClient.invalidateQueries({ queryKey: CVS_QUERY_KEY });
      if (outcome.kind === "gone") {
        requestClose();
        onDeleted?.();
        return;
      }
      setMessage(outcome.message);
    },
  });

  return (
    <dialog
      ref={ref}
      aria-labelledby={`delete-title-${cvId}`}
      onClose={onClose}
      onCancel={(event) => {
        // Escape must not close the dialog while the deletion request is in flight.
        if (remove.isPending) {
          event.preventDefault();
        }
      }}
      className="m-auto w-[min(484px,calc(100vw-32px))] rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
    >
      <div className="relative flex flex-col gap-6 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id={`delete-title-${cvId}`} className="text-xl font-semibold text-ink">
            Delete this CV?
          </h2>
        </div>

        <div className="flex flex-col gap-4 text-sm leading-[1.6] text-muted [overflow-wrap:anywhere]">
          <p>{subject}</p>
          <p>This permanently deletes the CV and its answers. You can’t undo this action.</p>
        </div>

        {message ? (
          <p role="alert" className="rounded-lg bg-danger-tint p-3 text-[13px] text-danger">
            <span className="font-medium">Error: </span>
            {message}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" autoFocus onClick={requestClose} disabled={remove.isPending}>
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
        {/* After the buttons in the DOM so Tab goes Cancel, Delete CV, Close (Figma 11.2); drawn at the top right. */}
        <button
          type="button"
          aria-label="Close"
          onClick={requestClose}
          disabled={remove.isPending}
          className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-lg text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          <X aria-hidden className="size-[18px]" strokeWidth={1.75} />
        </button>
      </div>
    </dialog>
  );
}
