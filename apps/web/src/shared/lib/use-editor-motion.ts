"use client";

import type { AutoAnimationPlugin } from "@formkit/auto-animate";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useEffect } from "react";

/** Animate list changes without scaling controls or interpolating their width/height. */
const editorMotion: AutoAnimationPlugin = (element, action, previous, next) => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const typing = document.activeElement?.matches("input, textarea, select");
  if (reduced || typing || element instanceof HTMLDialogElement) return new KeyframeEffect(element, [], { duration: 0 });

  if (action === "remove") {
    // AutoAnimate retains removed nodes briefly for their exit animation.
    if (element instanceof HTMLElement) element.inert = true;
    return new KeyframeEffect(element, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: "ease-out" });
  }
  if (action === "add") {
    return new KeyframeEffect(element, [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 180, easing: "ease-out" });
  }
  if (!previous || !next) return new KeyframeEffect(element, [], { duration: 0 });
  const x = previous.left - next.left;
  const y = previous.top - next.top;
  return new KeyframeEffect(element, [{ transform: `translate(${x}px, ${y}px)` }, { transform: "translate(0, 0)" }], { duration: x || y ? 180 : 0, easing: "ease-out" });
};

export function useEditorMotion<T extends HTMLElement = HTMLDivElement>(enabled = true) {
  const [ref, setEnabled] = useAutoAnimate<T>(editorMotion);
  useEffect(() => setEnabled(enabled), [enabled, setEnabled]);
  return ref;
}
