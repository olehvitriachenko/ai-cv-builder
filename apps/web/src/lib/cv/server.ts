import { cookies } from "next/headers";
import { getCvResult, getCvStatus, listCvs, type CvList, type CvResult, type CvStatus } from "@/lib/api/cvs";

/**
 * Server-side only: the first status for the CV page, loaded with the visitor's session cookie.
 * Throws `ApiError`, so the page can send a 401 to the login screen and a 404 to `notFound()`.
 */
export async function getCvStatusServer(id: string): Promise<CvStatus> {
  const cookie = (await cookies()).toString();
  return getCvStatus(id, cookie);
}

/** Server-side only: the first My CVs list, loaded with the visitor's session cookie. */
export async function listCvsServer(): Promise<CvList> {
  const cookie = (await cookies()).toString();
  return listCvs(cookie);
}

/** Server-side only: the draft, revision and questions of a COMPLETED CV for the editor. */
export async function getCvResultServer(id: string): Promise<CvResult> {
  const cookie = (await cookies()).toString();
  return getCvResult(id, cookie);
}
