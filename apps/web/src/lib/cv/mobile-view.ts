// The phone layout's two views and its sticky action (Figma 05.2, 05.3, 11.2 "Mobile safe area and
// keyboard contract"): one column showing either the editor or the preview, a sticky bar that
// switches between them, and the bar hides while the on-screen keyboard is open so the field being
// typed in stays above the keyboard.

export type MobileView = "editor" | "preview";

export interface StickyAction {
  label: string;
  /** The view the action switches to. */
  next: MobileView;
}

export function stickyAction(view: MobileView): StickyAction {
  return view === "editor" ? { label: "Preview CV", next: "preview" } : { label: "Edit CV", next: "editor" };
}

/** How much shorter than the page the visible area must be before it counts as the keyboard. */
export const KEYBOARD_THRESHOLD_PX = 150;

/** An on-screen keyboard shrinks the visual viewport; a collapsing toolbar only changes it a little. */
export function keyboardOpen(layoutHeight: number, visualHeight: number): boolean {
  return layoutHeight - visualHeight > KEYBOARD_THRESHOLD_PX;
}
