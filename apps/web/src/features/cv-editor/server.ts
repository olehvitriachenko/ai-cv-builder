import { cookies } from "next/headers";
import { getCvResult } from "./api/draft";
import type { CvResult } from "@/entities/cv/schemas";

/** Server-side only: the draft, revision and questions of a COMPLETED CV for the editor. */
export async function getCvResultServer(id: string): Promise<CvResult> {
  const cookie = (await cookies()).toString();
  return getCvResult(id, cookie);
}
