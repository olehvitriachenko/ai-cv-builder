import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account · AI CV Builder" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Create your account"
      description="A clearer CV. A confident next step. Start with your experience; we’ll help with the structure."
      switchPrompt="Already have an account?"
      switchLabel="Sign in"
      switchHref="/login"
      note="By creating an account, you agree to our Terms of Service and Privacy Policy."
    >
      <RegisterForm />
    </AuthShell>
  );
}
