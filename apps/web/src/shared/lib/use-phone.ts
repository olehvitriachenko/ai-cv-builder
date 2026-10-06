"use client";

import { useSyncExternalStore } from "react";

const PHONE = "(max-width: 639px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True below Tailwind's `sm` breakpoint. The server render assumes a wider screen. */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false);
}
