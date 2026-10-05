import { ChevronDown, TriangleAlert } from "lucide-react";
import {
  useId,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

// "Forma / Input", "Forma / Textarea" and "Forma / Select": 13px medium label, 8px radius, 44px
// control height, 12px helper text, danger border plus an icon and a text message for errors (never
// colour alone).

const CONTROL =
  "w-full rounded-lg border bg-surface text-sm text-ink placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted";

function controlBorder(error: string | undefined): string {
  return error ? "border-[1.5px] border-danger" : "border-line";
}

interface FieldFrameProps {
  label: string;
  /** Keeps the label for assistive technology only (the section heading already names the field). */
  labelHidden?: boolean;
  controlId: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function FieldFrame({ label, labelHidden = false, controlId, hint, error, children }: FieldFrameProps) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={controlId}
        className={labelHidden ? "sr-only" : "text-[13px] leading-[normal] font-medium text-ink"}
      >
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${controlId}-error`} className="flex items-start gap-1.5 text-xs leading-normal text-danger">
          <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" strokeWidth={2} />
          <span>
            <span className="sr-only">Error: </span>
            {error}
          </span>
        </p>
      ) : hint ? (
        <p id={`${controlId}-hint`} className="text-xs leading-normal text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(controlId: string, hint?: string, error?: string): string | undefined {
  if (error) {
    return `${controlId}-error`;
  }
  return hint ? `${controlId}-hint` : undefined;
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  labelHidden?: boolean;
  hint?: string;
  error?: string;
  /** Rendered over the right edge of the control (e.g. a show/hide button). Add `pr-*` via `className`. */
  adornment?: ReactNode;
}

export function TextField({
  label,
  labelHidden,
  hint,
  error,
  adornment,
  id,
  className = "",
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;

  const input = (
    <input
      id={controlId}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(controlId, hint, error)}
      className={`${CONTROL} h-11 px-3 ${controlBorder(error)} ${className}`}
      {...props}
    />
  );

  return (
    <FieldFrame label={label} labelHidden={labelHidden} controlId={controlId} hint={hint} error={error}>
      {adornment ? (
        <div className="relative">
          {input}
          {adornment}
        </div>
      ) : (
        input
      )}
    </FieldFrame>
  );
}

interface TextareaFieldProps extends ComponentProps<"textarea"> {
  label: string;
  labelHidden?: boolean;
  hint?: string;
  error?: string;
}

export function TextareaField({
  label,
  labelHidden,
  hint,
  error,
  id,
  className = "",
  ...props
}: TextareaFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;

  return (
    <FieldFrame label={label} labelHidden={labelHidden} controlId={controlId} hint={hint} error={error}>
      <textarea
        id={controlId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(controlId, hint, error)}
        className={`${CONTROL} min-h-[88px] resize-none p-3 leading-normal ${controlBorder(error)} ${className}`}
        {...props}
      />
    </FieldFrame>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** "Forma / Select": a native select (keyboard and mobile friendly) with the design's chevron. */
export function SelectField({ label, hint, error, id, className = "", children, ...props }: SelectFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;

  return (
    <FieldFrame label={label} controlId={controlId} hint={hint} error={error}>
      <div className="relative">
        <select
          id={controlId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(controlId, hint, error)}
          className={`${CONTROL} h-11 appearance-none pr-10 pl-3 ${controlBorder(error)} ${className}`}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
          strokeWidth={1.75}
        />
      </div>
    </FieldFrame>
  );
}
