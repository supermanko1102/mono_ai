import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

export async function getAuthenticatedVisitorId() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return null;
  }
  return `user:${email}`;
}
