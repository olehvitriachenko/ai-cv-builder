"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * TanStack Query is scoped to the CV page only (not the root layout): it is used for server state
 * and polling here, nowhere else, so there is no app-wide client state.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
