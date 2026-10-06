"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { User } from "@/lib/api/auth";

const UserContext = createContext<User | null>(null);

/** The signed-in user, loaded once by the layout (which also guards the route) for the page header. */
export function UserProvider({ user, children }: { user: User; children: ReactNode }) {
  return <UserContext value={user}>{children}</UserContext>;
}

export function useCurrentUser(): User {
  const user = useContext(UserContext);
  if (user === null) {
    throw new Error("useCurrentUser must be used inside the /cvs layout");
  }
  return user;
}
