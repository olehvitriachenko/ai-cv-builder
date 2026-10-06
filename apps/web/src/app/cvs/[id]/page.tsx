import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { CvResult } from "@/entities/cv/schemas";
import { isApiError } from "@/shared/api/fetcher";
import { getCvResultServer, getCvStatusServer } from "@/lib/cv/server";
import { AppShell } from "../../_components/app-shell";
import { CvEditor } from "./cv-editor";
import { GenerationView } from "./generation-view";

export const metadata: Metadata = { title: "Your CV · AI CV Builder" };

export default async function CvPage(props: PageProps<"/cvs/[id]">) {
  const { id } = await props.params;

  let status;
  try {
    status = await getCvStatusServer(id);
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 401) {
        redirect("/login");
      }
      // A malformed id, a missing CV and someone else's CV are all the same "not found".
      if (error.status === 400 || error.status === 404) {
        notFound();
      }
    }
    throw error;
  }

  let result: CvResult | null = null;
  if (status.status === "COMPLETED") {
    try {
      result = await getCvResultServer(id);
    } catch (error) {
      if (isApiError(error, 401)) {
        redirect("/login");
      }
      if (isApiError(error, 404)) {
        notFound();
      }
      // A 409 means the CV left COMPLETED between the two reads: show the generation view.
      if (!isApiError(error, 409)) {
        throw error;
      }
    }
  }

  if (result) {
    return <CvEditor cvId={id} initialResult={result} />;
  }

  return (
    <AppShell>
      <GenerationView initialStatus={status} />
    </AppShell>
  );
}
