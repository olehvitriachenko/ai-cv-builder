import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";

/**
 * `/cvs` (My CVs) is the authenticated product home. A convenience redirect only: the API enforces
 * authentication on every request.
 */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? "/cvs" : "/login");
}
