import { NextResponse } from "next/server";

import type { AgentMode } from "@/lib/agent-contract";
import { AGENT_MODES } from "@/lib/agent-contract";
import {
  createChatThread,
  listChatThreads,
  type ThreadStatus,
} from "@/lib/server/chat-thread-store";
import { getAuthenticatedVisitorId } from "@/lib/server/agent-auth";

export const runtime = "nodejs";

function normalizeStatus(value: string | null): ThreadStatus | "all" {
  if (value === "archived") {
    return "archived";
  }
  if (value === "all") {
    return "all";
  }
  return "active";
}

function normalizeMode(value: unknown): AgentMode {
  if (typeof value !== "string") {
    return "default";
  }
  const mode = value.trim().toLowerCase();
  return AGENT_MODES.includes(mode as AgentMode) ? (mode as AgentMode) : "default";
}

export async function GET(request: Request) {
  const visitorId = await getAuthenticatedVisitorId();
  if (!visitorId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = normalizeStatus(searchParams.get("status"));
  const limitParam = Number(searchParams.get("limit") ?? "40");
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(100, Math.trunc(limitParam)))
    : 40;

  const threads = listChatThreads({
    visitorId,
    status,
    limit,
  });
  return NextResponse.json({ threads, count: threads.length });
}

export async function POST(request: Request) {
  const visitorId = await getAuthenticatedVisitorId();
  if (!visitorId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const title = typeof body?.title === "string" ? body.title : undefined;
    const mode = normalizeMode(body?.mode);
    const thread = createChatThread({
      visitorId,
      title,
      mode,
    });
    return NextResponse.json({ thread }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "failed to create thread";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
