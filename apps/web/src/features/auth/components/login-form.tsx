"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/field";
import { PasswordField } from "@/shared/ui/password-field";
import { signIn } from "@/features/auth/api";
import { isApiError } from "@/shared/api/fetcher";

const loginFormSchema = z.object({
  email: z.string().trim().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema) });

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);
    try {
      await signIn(values);
      router.replace("/cvs");
      router.refresh();
    } catch (error) {
      // One message for every credential failure: it never says which part was wrong.
      if (isApiError(error, 401)) {
        setFormError("Invalid email or password.");
        return;
      }
      setFormError("Something went wrong. Please try again.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-6 short:gap-4"
    >
      <TextField
        label="Email address"
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
        inputMode="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <PasswordField
        label="Password"
        placeholder="Enter your password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      {formError ? (
        <p role="alert" className="text-sm text-danger">
          <span className="font-medium">Error: </span>
          {formError}
        </p>
      ) : null}
      <Button type="submit" stretch={false} className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
