import { cookies } from "next/headers";
import { getCvStatus, type CvStatus } from "@/lib/api/cvs";

/**
 * Server-side only: the first status for the CV page, loaded with the visitor's session cookie.
 * Throws `ApiError`, so the page can send a 401 to the login screen and a 404 to `notFound()`.
 */
export async function getCvStatusServer(id: string): Promise<CvStatus> {
  const cookie = (await cookies()).toString();
  return getCvStatus(id, cookie);
}
