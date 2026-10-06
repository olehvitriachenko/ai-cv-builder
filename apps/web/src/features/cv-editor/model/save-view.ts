import type { SaveState } from "./autosave";

// What the editor says about saving, from the autosaver's state (Figma 09.1, 09.2, 11.1): the
// status in the navigation, and the line under the workspace title. Meaning is always in the
// words; the icon and colour only reinforce it.

export type SaveIcon = "check" | "spinner" | "alert";

export interface SaveView {
  icon: SaveIcon;
  label: string;
  /** The same status for a phone navigation. */
  shortLabel: string;
  tone: "muted" | "danger";
  /** The status is a button for these: retry the save, or review the two versions. */
  action: "retry" | "review" | null;
  /** The supporting line under "Make it yours". */
  intro: string;
}

const INTRO = "Edit your details. The document preview follows your changes.";
const INTRO_SAVING = "Your current edits are reflected in the preview. The account copy is still saving.";

export function saveView(state: SaveState, invalid: boolean): SaveView {
  const waiting = state.status === "saving" || state.status === "dirty";
  const intro = waiting ? INTRO_SAVING : INTRO;

  if (invalid) {
    return { icon: "alert", label: "Fix the highlighted fields to save", shortLabel: "Fix fields", tone: "danger", action: null, intro };
  }
  switch (state.status) {
    case "saving":
      return { icon: "spinner", label: "Saving…", shortLabel: "Saving…", tone: "muted", action: null, intro };
    case "dirty":
      return { icon: "spinner", label: "Unsaved changes", shortLabel: "Unsaved", tone: "muted", action: null, intro };
    case "error":
      return { icon: "alert", label: "Couldn’t save · Retry", shortLabel: "Retry", tone: "danger", action: "retry", intro };
    case "conflict":
      return state.failure === "gone"
        ? { icon: "alert", label: "Can’t save", shortLabel: "Can’t save", tone: "danger", action: null, intro }
        : { icon: "alert", label: "Conflict · Review versions", shortLabel: "Conflict", tone: "danger", action: "review", intro };
    case "idle":
    case "saved":
      return { icon: "check", label: "All changes saved", shortLabel: "Saved", tone: "muted", action: null, intro };
  }
}
