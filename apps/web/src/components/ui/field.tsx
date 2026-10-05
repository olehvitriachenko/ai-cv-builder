import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

// "Forma / Input" and "Forma / Textarea": 13px medium label, 8px radius, 44px control height,
// 12px helper text, danger border plus a text message for errors (never colour alone).

const CONTROL =
  "w-full rounded-lg border bg-surface text-sm text-ink placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

function controlBorder(error: string | undefined): string {
  return error ? "border-[1.5px] border-danger" : "border-line";
}

interface FieldFrameProps {
  label: string;
  controlId: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

function FieldFrame({ label, controlId, hint, error, children }: FieldFrameProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={controlId} className="text-[13px] leading-[normal] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${controlId}-error`} className="text-xs leading-normal text-danger">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      ) : hint ? (
        <p id={`${controlId}-hint`} className="text-xs leading-normal text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(controlId: string, hint?: string, error?: string): string | undefined {
  if (error) {
    return `${controlId}-error`;
  }
  return hint ? `${controlId}-hint` : undefined;
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** Rendered over the right edge of the control (e.g. a show/hide button). Add `pr-*` via `className`. */
  adornment?: ReactNode;
}

export function TextField({
  label,
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
    <FieldFrame label={label} controlId={controlId} hint={hint} error={error}>
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

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextareaField({ label, hint, error, id, className = "", ...props }: TextareaFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;

  return (
    <FieldFrame label={label} controlId={controlId} hint={hint} error={error}>
      <textarea
        id={controlId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(controlId, hint, error)}
        className={`${CONTROL} min-h-[88px] resize-y p-3 leading-normal ${controlBorder(error)} ${className}`}
        {...props}
      />
    </FieldFrame>
  );
}
