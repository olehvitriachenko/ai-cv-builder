import { useId, type InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextField({
  label,
  error,
  id,
  className = "",
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`h-11 w-full rounded-md border bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground ${
          error ? "border-2 border-red-700 dark:border-red-400" : "border-foreground/30"
        } ${className}`}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-sm text-red-700 dark:text-red-400">
          <span className="font-medium">Error: </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
