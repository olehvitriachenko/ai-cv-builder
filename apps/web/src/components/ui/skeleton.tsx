/**
 * A stable loading placeholder bar ("Loading placeholder" in the Figma kit). Pulse only when the
 * user has not asked for reduced motion.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`rounded bg-skeleton motion-safe:animate-pulse ${className}`} />;
}
