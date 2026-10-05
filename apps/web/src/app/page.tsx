import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/server";

export default async function Home() {
  const user = await getCurrentUser();

  // A convenience redirect only: the API enforces authentication on every request.
  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto flex w-full max-w-[800px] flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.7px] text-ink sm:text-[30px]">
            Your next opportunity starts here
          </h1>
          <p className="text-sm leading-[1.6] text-muted">
            Upload an existing CV or share your background. We’ll help you turn it into a
            professional draft.
          </p>
        </div>
        <Card className="flex flex-col items-start gap-4 p-6">
          <p className="text-sm text-muted">
            Signed in as <strong className="font-medium break-all text-ink">{user.email}</strong>
          </p>
          <ButtonLink href="/cvs/new">
            <Sparkles aria-hidden className="size-4" strokeWidth={1.75} />
            Create a CV
          </ButtonLink>
        </Card>
      </main>
    </>
  );
}
