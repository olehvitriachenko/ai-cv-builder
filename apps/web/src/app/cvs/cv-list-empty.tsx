import { FilePlus2, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Figma 02.2 "Empty state": shown when the user has no CVs yet. */
export function CvListEmpty() {
  return (
    <Card className="flex flex-col items-center gap-6 p-8 text-center sm:p-16">
      <span className="flex size-14 items-center justify-center rounded-xl bg-accent-tint">
        <FilePlus2 aria-hidden className="size-[26px] text-accent" strokeWidth={1.75} />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-ink">Your next opportunity starts here</h2>
        <p className="text-sm leading-[1.6] text-muted">
          Upload an existing CV or share your background.
          <br className="hidden sm:inline" /> We’ll help you turn it into a professional draft.
        </p>
      </div>
      <ButtonLink href="/cvs/new">
        <Plus aria-hidden className="size-4" strokeWidth={1.75} />
        Create your first CV
      </ButtonLink>
      <p className="text-xs text-muted">Review and edit every detail before exporting.</p>
    </Card>
  );
}
