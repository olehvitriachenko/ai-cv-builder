import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

// "Forma / Button": 8px radius, 44px regular and 36px compact, one primary action per region.
export type ButtonVariant = "primary" | "secondary" | "destructive" | "text";
export type ButtonSize = "regular" | "compact";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "border-accent bg-accent text-white hover:opacity-90 disabled:opacity-60",
  secondary:
    "border-line bg-surface text-ink hover:bg-canvas disabled:bg-canvas disabled:text-placeholder",
  destructive: "border-danger bg-danger text-white hover:opacity-90 disabled:opacity-60",
  text: "border-transparent bg-transparent text-accent hover:bg-accent-tint disabled:text-placeholder",
};

const SIZES: Record<ButtonSize, string> = {
  regular: "h-11 px-4 text-sm",
  compact: "h-9 px-3 text-[13px]",
};

interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width on small screens, content width from `sm` up (default); `false` keeps content width. */
  stretch?: boolean;
  className?: string;
}

export function buttonClasses({
  variant = "primary",
  size = "regular",
  stretch = true,
  className = "",
}: ButtonStyleOptions = {}): string {
  return [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border font-semibold transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed",
    stretch ? "w-full sm:w-auto" : "",
    VARIANTS[variant],
    SIZES[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  Omit<ButtonStyleOptions, "className">;

export function Button({ variant, size, stretch, className, ...props }: ButtonProps) {
  return <button className={buttonClasses({ variant, size, stretch, className })} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & Omit<ButtonStyleOptions, "className"> & {
  className?: string;
};

/** A navigation link that looks like a button (a real link, not a button that navigates). */
export function ButtonLink({ variant, size, stretch, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses({ variant, size, stretch, className })} {...props} />;
}
