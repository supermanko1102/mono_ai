import { NextResponse } from "next/server";

import type { AgentMode, AgentSection } from "@/lib/agent-contract";
import { AGENT_MODES } from "@/lib/agent-contract";
import { isAgentSection, isAgentUiBlock } from "@/lib/agent-guards";
import {
  loadChatThreadState,
  saveChatThreadState,
  type PersistedChatMessage,
} from "@/lib/server/chat-thread-store";

export const runtime = "nodejs";

function normalizeMode(value: unknown): AgentMode {
  if (typeof value !== "string") {
    return "default";
  }
  const mode = value.trim().toLowerCase();
  return AGENT_MODES.includes(mode as AgentMode) ? (mode as AgentMode) : "default";
}

function normalizeMessages(value: unknown): PersistedChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const output: PersistedChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const role = row.role;
    const content = typeof row.content === "string" ? row.content : "";
    if (
      !id ||
      (role !== "assistant" && role !== "user" && role !== "system")
    ) {
      continue;
    }
    const normalized: PersistedChatMessage = {
      id,
      role,
      content,
    };
    if (isAgentUiBlock(row.ui)) {
      normalized.ui = row.ui;
    }
    if (!normalized.content.trim() && !normalized.ui) {
      continue;
    }
    output.push(normalized);
  }
  return output;
}

function normalizeSections(value: unknown): AgentSection[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is AgentSection => isAgentSection(item));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { searchParams } = new URL(request.url);
  const visitorId = searchParams.get("visitorId")?.trim() ?? "";
  if (!visitorId) {
    return NextResponse.json(
      { error: "visitorId is required" },
      { status: 400 }
    );
  }

  const state = loadChatThreadState({
    threadId,
    visitorId,
  });
  return NextResponse.json({ state });
}

export async function PUT(
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

    const state = saveChatThreadState({
      threadId,
      visitorId,
      mode: normalizeMode(body?.mode),
      title: typeof body?.title === "string" ? body.title : undefined,
      messages: normalizeMessages(body?.messages),
      sections: normalizeSections(body?.sections),
    });

    return NextResponse.json({ state });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "failed to save thread state";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
