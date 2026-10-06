"use client";

import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { AppShell } from "../../_components/app-shell";

/** Safe fallback for an unexpected failure while loading the page; nothing technical is shown. */
export default function CvError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-4 py-12">
        <Card className="flex flex-col items-start gap-4 p-8">
          <h1 className="text-xl font-semibold text-ink">
            Something went wrong
          </h1>
          <p className="text-sm leading-[1.6] text-muted">
            We couldn’t load this CV. Your information is safe. Please try
            again.
          </p>
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}
