"use client";

import { useSyncExternalStore } from "react";

/** Whether the browser reports no connection (the notice then says "Offline"). */
export function useOffline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("online", notify);
      window.addEventListener("offline", notify);
      return () => {
        window.removeEventListener("online", notify);
        window.removeEventListener("offline", notify);
      };
    },
    () => !navigator.onLine,
    () => false,
  );
}
