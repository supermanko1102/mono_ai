import { NextResponse } from "next/server";

import { getAuthenticatedVisitorId } from "@/lib/server/agent-auth";
import { setChatThreadArchived } from "@/lib/server/chat-thread-store";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const visitorId = await getAuthenticatedVisitorId();
  if (!visitorId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { threadId } = await params;
    const body = await request.json();

    const archived = body?.archived !== false;
    const thread = setChatThreadArchived({
      threadId,
      visitorId,
      archived,
    });
    if (!thread) {
      return NextResponse.json(
        { error: "thread not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ thread });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "failed to update thread";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
