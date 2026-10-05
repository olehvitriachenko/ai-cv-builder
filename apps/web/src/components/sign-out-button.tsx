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
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="compact"
        stretch={false}
        onClick={onClick}
        disabled={pending}
      >
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {failed ? (
        <p role="alert" className="text-xs text-danger">
          <span className="font-medium">Error: </span>
          Could not sign out. Please try again.
        </p>
      ) : null}
    </div>
  );
}
