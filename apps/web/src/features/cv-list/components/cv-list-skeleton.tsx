import { Card } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

/** Placeholder toolbar and cards with the real list's rhythm, so nothing jumps when it arrives. */
export function CvListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading your CVs" className="flex flex-col gap-8">
      <Skeleton className="h-4 w-12" />
      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        {Array.from({ length: count }, (_, index) => (
          <Card key={index} className="flex flex-col gap-6 p-6">
            <div className="flex items-center justify-between">
              <Skeleton className="size-10 rounded-lg" />
              <Skeleton className="h-6 w-20" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="h-px bg-line" />
            <Skeleton className="h-9 w-40 rounded-lg" />
          </Card>
        ))}
      </div>
    </div>
  );
}
