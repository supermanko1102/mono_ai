import { NextResponse } from "next/server";

import { setChatThreadArchived } from "@/lib/server/chat-thread-store";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const body = await request.json();
    const visitorId =
      typeof body?.visitorId === "string" ? body.visitorId.trim() : "";
    if (!visitorId) {
      return NextResponse.json(
        { error: "visitorId is required" },
        { status: 400 }
      );
    }

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
