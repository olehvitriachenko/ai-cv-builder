"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { registerAccount } from "@/lib/api/auth";
import { isApiError } from "@/lib/api/fetcher";

// Mirrors the server rules for fast feedback; the server stays authoritative.
const registerFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(254, "Email must be at most 254 characters")
    .pipe(z.email("Enter a valid email address")),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

type RegisterFormValues = z.infer<typeof registerFormSchema>;

const FIELDS = ["email", "password"] as const;

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerFormSchema) });

  async function onSubmit(values: RegisterFormValues) {
    setFormError(null);
    try {
      await registerAccount(values);
      router.replace("/cvs");
      router.refresh();
    } catch (error) {
      if (isApiError(error, 409)) {
        setError("email", {
          message: "An account with this email is already registered.",
        });
        return;
      }
      if (isApiError(error, 400) && error.fieldErrors) {
        let mapped = false;
        for (const field of FIELDS) {
          const message = error.fieldErrors[field]?.[0];
          if (message) {
            setError(field, { message });
            mapped = true;
          }
        }
        if (mapped) {
          return;
        }
      }
      setFormError("Something went wrong. Please try again.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-4"
    >
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register("password")}
      />
      {formError ? (
        <p role="alert" className="text-sm text-danger">
          <span className="font-medium">Error: </span>
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
