import { describe, expect, it } from "vitest";
import type { SaveState } from "./autosave";
import { saveView } from "./save-view";

const state = (status: SaveState["status"], failure: SaveState["failure"] = null): SaveState => ({
  status,
  revision: 1,
  failure,
});

describe("saveView", () => {
  it("says All changes saved with a check, and nothing is clickable", () => {
    for (const status of ["idle", "saved"] as const) {
      expect(saveView(state(status), false)).toMatchObject({
        icon: "check",
        label: "All changes saved",
        shortLabel: "Saved",
        tone: "muted",
        action: null,
      });
    }
  });

  it("says Saving… with a spinner while a save runs", () => {
    expect(saveView(state("saving"), false)).toMatchObject({ icon: "spinner", label: "Saving…", action: null });
  });

  it("says Unsaved changes while a save is waiting for the pause in typing", () => {
    expect(saveView(state("dirty"), false)).toMatchObject({ label: "Unsaved changes", action: null });
  });

  it("offers Retry when saving failed, in words and not only colour", () => {
    expect(saveView(state("error", "other"), false)).toMatchObject({
      icon: "alert",
      label: "Couldn’t save · Retry",
      tone: "danger",
      action: "retry",
    });
  });

  it("offers Review versions when a newer saved version exists, and nothing when the CV is gone", () => {
    expect(saveView(state("conflict", "conflict"), false)).toMatchObject({
      label: "Conflict · Review versions",
      shortLabel: "Conflict",
      action: "review",
    });
    expect(saveView(state("conflict", "gone"), false)).toMatchObject({ label: "Can’t save", action: null });
  });

  it("says why nothing is saved while the form has errors, before any save state", () => {
    expect(saveView(state("saved"), true)).toMatchObject({
      label: "Fix the highlighted fields to save",
      tone: "danger",
      action: null,
    });
  });

  it("tells the person that edits are shown in the preview while the account copy is saving", () => {
    expect(saveView(state("saving"), false).intro).toBe(
      "Your current edits are reflected in the preview. The account copy is still saving.",
    );
    expect(saveView(state("dirty"), false).intro).toContain("still saving");
    expect(saveView(state("saved"), false).intro).toBe("Edit your details. The document preview follows your changes.");
    expect(saveView(state("error", "other"), false).intro).toBe(
      "Edit your details. The document preview follows your changes.",
    );
  });
});
