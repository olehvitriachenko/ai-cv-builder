"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * TanStack Query is scoped to the `/cvs` screens only (not the root layout): it is used for server
 * state (list and generation polling, save/apply mutations) here, nowhere else, so there is no
 * app-wide client state.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
