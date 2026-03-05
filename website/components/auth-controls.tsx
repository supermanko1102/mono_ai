"use client";

import { signIn, signOut, useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function AuthControls() {
  const { data: session, status } = useSession();
  const userLabel = session?.user?.name ?? session?.user?.email ?? "Account";

  if (status === "loading") {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-9 border-slate-300 text-xs"
        disabled
      >
        Loading...
      </Button>
    );
  }

  if (!session?.user) {
    return (
      <Button
        type="button"
        className="h-9 bg-slate-900 hover:bg-slate-800"
        onClick={() => signIn("google")}
      >
        Sign in with Google
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <p className="max-w-36 truncate text-xs text-slate-600" title={userLabel}>
        {userLabel}
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-9 border-slate-300 text-xs"
        onClick={() => signOut()}
      >
        Sign out
      </Button>
    </div>
  );
}
