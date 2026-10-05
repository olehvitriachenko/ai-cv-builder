import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentUser } from "@/lib/auth/server";

export default async function Home() {
  const user = await getCurrentUser();

  // A convenience redirect only: the API enforces authentication on every request.
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">AI CV Builder</h1>
      <p>
        Signed in as <strong className="break-all">{user.email}</strong>
      </p>
      <SignOutButton />
    </main>
  );
}
