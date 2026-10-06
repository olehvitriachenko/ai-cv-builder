"use client";

import { useEffect, useState } from "react";
import { keyboardOpen, stickyAction, type MobileView } from "../../model/mobile-view";

/**
 * The phone's sticky action (Figma 05.2, 11.2): "Preview CV" while editing, "Edit CV" while
 * previewing. Its bottom padding is 16 px plus the safe-area inset, and it hides while the on-screen
 * keyboard is open so the field being typed in stays above the keyboard.
 */
export function PreviewBar({ view, onSwitch }: { view: MobileView; onSwitch: (view: MobileView) => void }) {
  const [typing, setTyping] = useState(false);
  const action = stickyAction(view);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (viewport === null) {
      return;
    }
    const update = () => setTyping(keyboardOpen(window.innerHeight, viewport.height));
    viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, []);

  if (typing) {
    return null;
  }
  return (
    <div className="cv-editor-motion fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden">
      <button
        type="button"
        onClick={() => {
          onSwitch(action.next);
          window.scrollTo({ top: 0 });
        }}
        className="h-11 w-full rounded-lg border border-accent bg-accent text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {action.label}
      </button>
    </div>
  );
}
