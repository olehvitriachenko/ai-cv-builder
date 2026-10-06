import { describe, expect, it } from "vitest";
import {
  canZoomIn,
  canZoomOut,
  estimatePages,
  A4_WIDTH_PX,
  SHEET_WIDTH_PX,
  fitScale,
  sheetScale,
  MAX_ZOOM,
  MIN_ZOOM,
  previewStatus,
  statusLine,
  zoomIn,
  zoomLabel,
  zoomOut,
} from "./preview-zoom";

describe("zoom steps", () => {
  it("moves in steps of 10 points between 50 and 150", () => {
    expect([MIN_ZOOM, MAX_ZOOM]).toEqual([50, 150]);
    expect(zoomIn(100)).toBe(110);
    expect(zoomOut(100)).toBe(90);
    expect(zoomIn(83)).toBe(93);
    expect(zoomOut(83)).toBe(73);
  });

  it("clamps at the limits and disables the control that cannot move", () => {
    expect(zoomIn(145)).toBe(150);
    expect(zoomIn(150)).toBe(150);
    expect(zoomOut(55)).toBe(50);
    expect(zoomOut(50)).toBe(50);

    expect(canZoomIn(150)).toBe(false);
    expect(canZoomIn(149)).toBe(true);
    expect(canZoomOut(50)).toBe(false);
    expect(canZoomOut(51)).toBe(true);
  });

  it("never pushes a fitted phone scale (below 50) up when zooming out", () => {
    expect(zoomOut(45)).toBe(45);
    expect(canZoomOut(45)).toBe(false);
    expect(zoomIn(45)).toBe(55);
    expect(canZoomIn(45)).toBe(true);
  });

  it("labels the zoom as a whole percentage", () => {
    expect(zoomLabel(83)).toBe("83%");
    expect(zoomLabel(100)).toBe("100%");
  });
});

describe("sheet scale", () => {
  it("reads the 660 px design sheet as 83% and a full A4 as 100%", () => {
    expect(sheetScale(83) * SHEET_WIDTH_PX).toBeCloseTo(659, 0);
    expect(sheetScale(100) * SHEET_WIDTH_PX).toBeCloseTo(A4_WIDTH_PX, 5);
    expect(Math.round(sheetScale(45) * SHEET_WIDTH_PX)).toBe(357);
  });

  it("fits a phone: a 358 px stage gives 45%", () => {
    expect(fitScale(358, A4_WIDTH_PX)).toBe(45);
  });
});

describe("fitScale", () => {
  it("fits the sheet into the container width and never exceeds 100", () => {
    expect(fitScale(330, 660)).toBe(50);
    expect(fitScale(548, 660)).toBe(83);
    expect(fitScale(660, 660)).toBe(100);
    expect(fitScale(1200, 660)).toBe(100);
  });

  it("rounds down so the sheet never overflows the container", () => {
    expect(fitScale(299, 660)).toBe(45);
  });

  it("falls back to 100 while the container has no width yet (hidden or not measured)", () => {
    expect(fitScale(0, 660)).toBe(100);
    expect(fitScale(-5, 660)).toBe(100);
  });
});

describe("estimatePages", () => {
  const A4 = 933;

  it("is at least one page", () => {
    expect(estimatePages(0, A4)).toBe(1);
    expect(estimatePages(400, A4)).toBe(1);
    expect(estimatePages(A4, A4)).toBe(1);
  });

  it("ignores a pixel or two of rounding past the page", () => {
    expect(estimatePages(A4 + 1, A4)).toBe(1);
  });

  it("counts a started extra page", () => {
    expect(estimatePages(A4 + 20, A4)).toBe(2);
    expect(estimatePages(A4 * 2, A4)).toBe(2);
    expect(estimatePages(A4 * 2 + 40, A4)).toBe(3);
  });
});

describe("preview status", () => {
  it("is up to date once saved, or before any edit", () => {
    for (const saveStatus of ["idle", "saved"] as const) {
      expect(previewStatus({ saveStatus, invalid: false })).toEqual({
        upToDate: true,
        short: "Up to date",
        detail: "Ready to download",
      });
    }
    expect(statusLine({ saveStatus: "saved", invalid: false })).toBe("Up to date · Ready to download");
  });

  it("says the preview shows the current local draft while it is being saved", () => {
    for (const saveStatus of ["dirty", "saving"] as const) {
      expect(statusLine({ saveStatus, invalid: false })).toBe("Current local draft · Saving to your account…");
      expect(previewStatus({ saveStatus, invalid: false }).upToDate).toBe(false);
    }
  });

  it("identifies the local unsaved preview when a save fails or conflicts", () => {
    for (const saveStatus of ["error", "conflict"] as const) {
      expect(statusLine({ saveStatus, invalid: false })).toBe(
        "Your unsaved version · Current edits remain in the editor",
      );
    }
    expect(previewStatus({ saveStatus: "saved", invalid: true }).upToDate).toBe(false);
  });
});
