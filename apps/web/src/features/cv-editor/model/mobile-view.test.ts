import { describe, expect, it } from "vitest";
import { KEYBOARD_THRESHOLD_PX, keyboardOpen, stickyAction } from "./mobile-view";

describe("stickyAction", () => {
  it("offers Preview CV while editing and Edit CV while previewing, each going to the other view", () => {
    expect(stickyAction("editor")).toEqual({ label: "Preview CV", next: "preview" });
    expect(stickyAction("preview")).toEqual({ label: "Edit CV", next: "editor" });
  });
});

describe("keyboardOpen", () => {
  it("reads a visual viewport much shorter than the layout viewport as an open keyboard", () => {
    expect(keyboardOpen(800, 480)).toBe(true);
    expect(keyboardOpen(800, 800 - KEYBOARD_THRESHOLD_PX - 1)).toBe(true);
  });

  it("does not mistake the browser toolbar or a small resize for a keyboard", () => {
    expect(keyboardOpen(800, 800)).toBe(false);
    expect(keyboardOpen(800, 760)).toBe(false);
    expect(keyboardOpen(800, 800 - KEYBOARD_THRESHOLD_PX)).toBe(false);
  });
});
