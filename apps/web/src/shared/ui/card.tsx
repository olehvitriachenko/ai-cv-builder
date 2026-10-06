import type { HTMLAttributes } from "react";

/** "Forma / Card": white surface, 1px rule, 12px radius, no decorative effects. */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`} {...props} />;
}
