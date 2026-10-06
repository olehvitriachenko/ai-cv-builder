"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { TextField, type TextFieldProps } from "@/shared/ui/field";

/** A password input with a show/hide button. The value stays in the input, so form libraries are unaffected. */
export function PasswordField({
  className = "",
  ...props
}: Omit<TextFieldProps, "type" | "adornment">) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      className={`pr-11 ${className}`}
      adornment={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <Icon aria-hidden className="size-5" strokeWidth={1.75} />
        </button>
      }
    />
  );
}
