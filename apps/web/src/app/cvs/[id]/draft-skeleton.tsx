import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function SectionPlaceholder() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-2.5 w-[104px]" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-[250px] max-w-full" />
    </div>
  );
}

/** Figma "Draft preview": a stable placeholder of the CV while it is being built (or has failed). */
export function DraftSkeleton({ caption, note }: { caption: string; note: string }) {
  return (
    <Card className="flex w-full flex-col gap-6 p-8 lg:w-[376px] lg:shrink-0">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{caption}</p>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-[190px]" />
        <Skeleton className="h-3 w-[230px] max-w-full" />
        <Skeleton className="h-2 w-40" />
      </div>
      <hr className="border-line" />
      <SectionPlaceholder />
      <SectionPlaceholder />
      <SectionPlaceholder />
      <p className="text-xs leading-normal text-muted">{note}</p>
    </Card>
  );
}
