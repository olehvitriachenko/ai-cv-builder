import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · AI CV Builder" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to pick up where you left off and make your next career move."
      switchPrompt="New to Forma?"
      switchLabel="Create an account"
      switchHref="/register"
      note="Your experience, thoughtfully presented."
    >
      <LoginForm />
    </AuthShell>
  );
}
