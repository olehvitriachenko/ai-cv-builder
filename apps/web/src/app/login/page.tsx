import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · AI CV Builder" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <LoginForm />
      <p className="text-sm">
        New here?{" "}
        <Link href="/register" className="font-medium underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}
