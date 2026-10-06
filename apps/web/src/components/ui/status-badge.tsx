import type { DisplayStatus, GenerationStatus } from "@/entities/cv/schemas";

// "Forma / Status badge": 6px radius, 5px dot, 12px medium label. The label carries the meaning;
// the colour only reinforces it.
const STATUS_STYLES: Record<GenerationStatus, { label: string; badge: string; dot: string }> = {
  PENDING: { label: "Queued", badge: "bg-canvas text-muted", dot: "bg-muted" },
  PROCESSING: { label: "Processing", badge: "bg-accent-tint text-accent", dot: "bg-accent" },
  COMPLETED: { label: "Completed", badge: "bg-success-tint text-success", dot: "bg-success" },
  FAILED: { label: "Failed", badge: "bg-danger-tint text-danger", dot: "bg-danger" },
};

export function StatusBadge({ status }: { status: GenerationStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${style.badge}`}
    >
      <span aria-hidden className={`size-[5px] rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}

// My CVs shows the server-derived display status: Draft is a completed CV with unresolved questions.
const DISPLAY_STATUS_STYLES: Record<DisplayStatus, { label: string; badge: string; dot: string }> = {
  PROCESSING: { label: "Processing", badge: "bg-accent-tint text-accent", dot: "bg-accent" },
  FAILED: { label: "Failed", badge: "bg-danger-tint text-danger", dot: "bg-danger" },
  DRAFT: { label: "Draft", badge: "bg-canvas text-muted", dot: "bg-muted" },
  COMPLETED: { label: "Completed", badge: "bg-success-tint text-success", dot: "bg-success" },
};

export function DisplayStatusBadge({ status }: { status: DisplayStatus }) {
  const style = DISPLAY_STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${style.badge}`}
    >
      <span aria-hidden className={`size-[5px] rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
