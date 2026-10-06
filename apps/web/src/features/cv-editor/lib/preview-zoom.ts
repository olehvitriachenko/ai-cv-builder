import type { SaveStatus } from "../model/autosave";

// Zoom, fit and page-count rules of the document preview (inline panel and full-screen view). Pure
// numbers and text, so they are tested without a DOM. Zoom is a whole percentage of an A4 sheet at
// 96 dpi (794 px wide), as in the design: the 660 px sheet the document is laid out at reads as 83%
// and a phone-wide sheet reads as 45%.

export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;
/** The width the document is laid out at (Figma "A4 CV page"). */
export const SHEET_WIDTH_PX = 660;
/** The label of the sheet at its design size; the inline preview never starts larger. */
export const DESIGN_ZOOM = 83;

/** The CSS scale to draw the 660 px layout at a zoom label. */
export const sheetScale = (zoom: number): number => (zoom / 100) * (A4_WIDTH_PX / SHEET_WIDTH_PX);

export const MIN_ZOOM = 50;
export const MAX_ZOOM = 150;
export const ZOOM_STEP = 10;

export const canZoomIn = (zoom: number): boolean => zoom < MAX_ZOOM;
export const canZoomOut = (zoom: number): boolean => zoom > MIN_ZOOM;

export function zoomIn(zoom: number): number {
  return Math.min(MAX_ZOOM, zoom + ZOOM_STEP);
}

/** A fitted phone scale can be below the minimum; zooming out then leaves it where it is. */
export function zoomOut(zoom: number): number {
  return canZoomOut(zoom) ? Math.max(MIN_ZOOM, zoom - ZOOM_STEP) : zoom;
}

export const zoomLabel = (zoom: number): string => `${zoom}%`;

/**
 * The percentage that makes the sheet fit the container width: rounded down so it never overflows,
 * never above 100. A container with no width (hidden, not measured yet) reads as "no constraint".
 */
export function fitScale(containerWidth: number, sheetWidth: number): number {
  if (containerWidth <= 0 || sheetWidth <= 0) {
    return 100;
  }
  return Math.min(100, Math.floor((containerWidth / sheetWidth) * 100));
}

/** Pixels of rounding that do not start another page. */
const PAGE_TOLERANCE = 2;

/** An estimate from the preview's height; the real pagination belongs to the PDF export. */
export function estimatePages(contentHeight: number, pageHeight: number): number {
  return Math.max(1, Math.ceil((contentHeight - PAGE_TOLERANCE) / pageHeight));
}

export interface PreviewStatus {
  upToDate: boolean;
  /** The short half (shown alone on a phone header). */
  short: string;
  /** The second half: what the person can rely on. */
  detail: string;
}

/**
 * The preview always renders the current form, but the downloaded PDF is built from the saved
 * draft. While a save is running it reads "Current local draft · Saving to your account…"; it is
 * "up to date" when everything is saved, and otherwise (failed save, conflict, invalid form) the
 * caption identifies the unsaved version being displayed.
 */
export function previewStatus({ saveStatus, invalid }: { saveStatus: SaveStatus; invalid: boolean }): PreviewStatus {
  if (!invalid && (saveStatus === "saving" || saveStatus === "dirty")) {
    return { upToDate: false, short: "Current local draft", detail: "Saving to your account…" };
  }
  const upToDate = !invalid && (saveStatus === "idle" || saveStatus === "saved");
  return upToDate
    ? { upToDate, short: "Up to date", detail: "Ready to download" }
    : { upToDate, short: "Your unsaved version", detail: "Current edits remain in the editor" };
}

export function statusLine(input: { saveStatus: SaveStatus; invalid: boolean }): string {
  const { short, detail } = previewStatus(input);
  return `${short} · ${detail}`;
}
