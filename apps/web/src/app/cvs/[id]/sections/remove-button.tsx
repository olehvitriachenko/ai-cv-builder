import { Trash2 } from "lucide-react";

/** The trash button that removes an entry, a link or a category: a 44 px square, red on hover. */
export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-muted hover:border-danger hover:bg-danger-tint hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Trash2 aria-hidden className="size-[18px]" strokeWidth={1.75} />
    </button>
  );
}
