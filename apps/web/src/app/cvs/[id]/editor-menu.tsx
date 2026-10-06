"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { DeleteCvDialog } from "../../../features/cv-delete/components/delete-cv-dialog";

/**
 * The more-options menu of the editor navigation: exactly **Back to My CVs** and **Delete CV**.
 * Delete CV opens the existing confirmation dialog; once the CV is gone the editor leaves for My CVs.
 * Escape and a click outside close the panel (like the account menu); focus returns to the trigger.
 */
export function EditorMenu({ cvId, subject }: { cvId: string; subject: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Figma 11.1 "More options / Open menu": Back to My CVs is an outlined button, Delete CV the
  // destructive one, both full width and 44 px high.
  const item =
    "flex h-11 w-full items-center justify-center rounded-lg border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="More options"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="flex size-11 items-center justify-center rounded-lg text-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Ellipsis aria-hidden className="size-[18px]" strokeWidth={1.75} />
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute top-full right-0 z-30 mt-2 flex w-56 flex-col gap-2 rounded-xl border border-line bg-surface p-2"
        >
          <Link href="/cvs" className={`${item} border-line bg-surface text-accent hover:bg-canvas`}>
            Back to My CVs
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setConfirming(true);
            }}
            className={`${item} border-danger bg-danger text-white hover:opacity-90`}
          >
            Delete CV
          </button>
        </div>
      ) : null}

      {confirming ? (
        <DeleteCvDialog
          cvId={cvId}
          subject={subject}
          onClose={() => setConfirming(false)}
          onDeleted={() => {
            router.replace("/cvs");
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
