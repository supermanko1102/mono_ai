import { NextResponse } from "next/server";

import {
  loadChatState,
  saveChatState,
  type PersistedChatMessage,
} from "@/lib/server/chat-store";
import type { AgentMode, AgentSection } from "@/lib/agent-contract";
import { AGENT_MODES } from "@/lib/agent-contract";
import { isAgentSection, isAgentUiBlock } from "@/lib/agent-guards";
import { getAuthenticatedVisitorId } from "@/lib/server/agent-auth";

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
  const messages: PersistedChatMessage[] = [];
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
    const message: PersistedChatMessage = {
      id,
      role,
      content,
    };
    if (isAgentUiBlock(row.ui)) {
      message.ui = row.ui;
    }
    if (!message.content.trim() && !message.ui) {
      continue;
    }
    messages.push(message);
  }
  return messages;
}

function normalizeSections(value: unknown): AgentSection[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is AgentSection => isAgentSection(item));
}

export async function GET(request: Request) {
  if (!(await getAuthenticatedVisitorId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId")?.trim() ?? "";
  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }

  const state = loadChatState(sessionId);
  return NextResponse.json({ state });
}

export async function PUT(request: Request) {
  if (!(await getAuthenticatedVisitorId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const sessionId =
      typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const saved = saveChatState({
      sessionId,
      mode: normalizeMode(body?.mode),
      messages: normalizeMessages(body?.messages),
      sections: normalizeSections(body?.sections),
    });

    return NextResponse.json({ state: saved });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "failed to save chat state";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
