"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { closeEditorDialog } from "@/shared/lib/dialog-motion";

/**
 * A destructive confirmation on the native `<dialog>` (Figma "Delete confirmation" pattern):
 * modal, Escape closes it, focus is trapped, **Cancel has the initial focus** and the tab order is
 * Cancel, the destructive action, then Close. Mount it only while confirming; it closes through the
 * element so the browser returns focus to what opened it, and `onClose` then unmounts it.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const requestClose = () => closeEditorDialog(ref.current);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      className="m-auto w-[min(484px,calc(100vw-32px))] rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
    >
      <div className="relative flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-4 pr-11">
          <h2 id={titleId} className="text-xl font-semibold text-ink">
            {title}
          </h2>
          <div className="text-sm leading-[1.6] text-muted">{children}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" stretch={false} autoFocus onClick={requestClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            stretch={false}
            onClick={() => closeEditorDialog(ref.current, onConfirm)}
          >
            {confirmLabel}
          </Button>
        </div>
        {/* After the buttons in the DOM, so Tab reaches it last; drawn at the top right. */}
        <button
          type="button"
          aria-label="Close"
          onClick={requestClose}
          className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-lg text-muted hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X aria-hidden className="size-5" strokeWidth={1.75} />
        </button>
      </div>
    </dialog>
  );
}
