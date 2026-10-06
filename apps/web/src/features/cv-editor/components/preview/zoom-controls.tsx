import { canZoomIn, canZoomOut, zoomLabel } from "@/features/cv-editor/lib/preview-zoom";

type Size = "panel" | "bar" | "touch";

// Figma "Zoom controls": a bordered pill with − , the percentage and +. The panel is 32 px high, the
// desktop full-screen bar 36 px and the phone bar 44 px per control.
const FRAME: Record<Size, string> = {
  panel: "h-8 gap-3.5 px-3",
  bar: "h-9 gap-4 px-3",
  touch: "h-11 gap-0 px-0",
};
const BUTTON: Record<Size, string> = {
  panel: "text-sm leading-none",
  bar: "text-lg leading-none",
  touch: "size-11 text-sm font-semibold",
};
const VALUE: Record<Size, string> = {
  panel: "text-[11px] text-ink",
  bar: "text-xs font-medium text-ink",
  touch: "w-11 text-center text-[13px] font-medium text-ink",
};

export function ZoomControls({
  zoom,
  size,
  onZoomIn,
  onZoomOut,
}: {
  zoom: number;
  size: Size;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const button =
    "flex items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-40 " +
    (size === "touch" ? "text-accent" : "text-muted hover:text-ink");

  return (
    <div role="group" aria-label="Zoom" className={`flex items-center rounded-lg border border-line bg-surface ${FRAME[size]}`}>
      <button type="button" aria-label="Zoom out" disabled={!canZoomOut(zoom)} onClick={onZoomOut} className={`${button} ${BUTTON[size]}`}>
        <span aria-hidden>−</span>
      </button>
      <span role="status" aria-label="Zoom level" className={VALUE[size]}>
        {zoomLabel(zoom)}
      </span>
      <button type="button" aria-label="Zoom in" disabled={!canZoomIn(zoom)} onClick={onZoomIn} className={`${button} ${BUTTON[size]}`}>
        <span aria-hidden>+</span>
      </button>
    </div>
  );
}
