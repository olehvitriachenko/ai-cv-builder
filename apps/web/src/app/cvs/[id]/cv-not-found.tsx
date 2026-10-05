import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Shown for a missing CV and for someone else’s: the two are deliberately indistinguishable. */
export function CvNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-4 py-12">
      <Card className="flex flex-col items-start gap-4 p-8">
        <h1 className="text-xl font-semibold text-ink">We couldn’t find this CV</h1>
        <p className="text-sm leading-[1.6] text-muted">
          It may have been removed, or the link may be wrong. You can start a new CV instead.
        </p>
        <ButtonLink href="/cvs/new">Start a new CV</ButtonLink>
      </Card>
    </div>
  );
}
