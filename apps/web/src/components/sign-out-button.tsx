"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/api/auth";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onClick() {
    setPending(true);
    setFailed(false);
    try {
      await signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={onClick} disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {failed ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          <span className="font-medium">Error: </span>
          Could not sign out. Please try again.
        </p>
      ) : null}
    </div>
  );
}
