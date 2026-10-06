import { cookies } from "next/headers";
import { listCvs } from "./api";
import type { CvList } from "@/entities/cv/schemas";

/** Server-side only: the first My CVs list, loaded with the visitor's session cookie. */
export async function listCvsServer(): Promise<CvList> {
  const cookie = (await cookies()).toString();
  return listCvs(cookie);
}
