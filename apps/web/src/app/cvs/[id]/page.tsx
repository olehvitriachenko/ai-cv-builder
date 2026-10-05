import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/api/fetcher";
import { getCvStatusServer } from "@/lib/cv/server";
import { GenerationView } from "./generation-view";

export const metadata: Metadata = { title: "Your CV · AI CV Builder" };

export default async function CvPage(props: PageProps<"/cvs/[id]">) {
  const { id } = await props.params;

  let status;
  try {
    status = await getCvStatusServer(id);
  } catch (error) {
    if (error instanceof ApiError) {
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

  return <GenerationView initialStatus={status} />;
}
