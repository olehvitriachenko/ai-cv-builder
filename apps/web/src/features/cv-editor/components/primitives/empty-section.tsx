import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** The empty state of Experience and Education (06.2): nothing is added until the person adds it. */
export function EmptySection({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-4 py-8 text-center">
      <span aria-hidden className="flex size-10 items-center justify-center rounded-lg bg-accent-tint text-accent">
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <p className="text-base leading-[normal] font-semibold text-ink">{title}</p>
      <p className="max-w-[280px] text-xs leading-normal text-muted">{text}</p>
      {action}
    </div>
  );
}
