"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import type { AgentAction, AgentSection, AgentUiBlock } from "@/lib/agent-contract";
import { isAgentSection } from "@/lib/agent-guards";
import { mergeActions, readAgentStream } from "@/lib/agent-stream";
import {
  AGENT_MODAL_IDS,
  AGENT_ROUTES,
  getModalById,
  getModalTitle,
  normalizeModalId,
  normalizePath,
} from "@/lib/agent-registry";
import { emitAgentSectionCreate } from "@/lib/runtime-section-events";
import { AgentUiBlockRenderer } from "@/components/agent-ui-block-renderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const SESSION_KEY = "website-v1-agent-session-id";

type ChatMessage = {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  ui?: AgentUiBlock;
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getOrCreateSessionId() {
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }

  const created = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

function withMessageContent(
  messages: ChatMessage[],
  messageId: string,
  appendText: string
) {
  return messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }
    return {
      ...message,
      content: message.content + appendText,
    };
  });
}

function withMessageContentFallback(
  messages: ChatMessage[],
  messageId: string,
  fallbackText: string
) {
  return messages.map((message) => {
    if (message.id !== messageId || message.content.trim()) {
      return message;
    }
    return {
      ...message,
      content: fallbackText,
    };
  });
}

export function AgentChatWidget() {
  const router = useRouter();
  const pathname = usePathname();
  const currentPath = normalizePath(pathname ?? "/");

  const [sessionId, setSessionId] = useState("");
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [openModalId, setOpenModalId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeId(),
      role: "assistant",
      content: "我是網站助理。你可以說：帶我去 docs 並開啟快速上手。",
    },
  ]);

  const activeModal = getModalById(openModalId);
  const routeOptions = useMemo(() => [...AGENT_ROUTES], []);
  const modalOptions = useMemo(() => [...AGENT_MODAL_IDS], []);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);

  useEffect(() => {
    if (!activeModal) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenModalId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeModal]);

  function appendSystemMessages(lines: string[]) {
    if (lines.length === 0) {
      return;
    }
    setMessages((prev) => [
      ...prev,
      ...lines.map((line) => ({
        id: makeId(),
        role: "system" as const,
        content: line,
      })),
    ]);
  }

  function runActions(actions: AgentAction[]) {
    const notices: string[] = [];
    let pathCursor = currentPath;

    for (const action of actions) {
      if (action.type === "navigate") {
        const nextPath = normalizePath(action.to);
        if (nextPath !== pathCursor) {
          router.push(nextPath);
          pathCursor = nextPath;
          notices.push(`已切換到 ${nextPath}`);
        }
        continue;
      }

      const modalId = normalizeModalId(action.id);
      if (modalId) {
        setOpenModalId(modalId);
        notices.push(`已開啟視窗：${getModalTitle(modalId)}`);
      }
    }

    appendSystemMessages(notices);
  }

  async function sendMessage(rawText: string) {
    const text = rawText.trim();
    if (!text || loading || !sessionId) {
      return;
    }

    const assistantMessageId = makeId();
    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: "user", content: text },
      { id: assistantMessageId, role: "assistant", content: "" },
    ]);
    setInput("");

    try {
      const response = await fetch("/api/agent/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          message: text,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locale: navigator.language || "zh-TW",
          availableRoutes: routeOptions,
          availableModals: modalOptions,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Agent request failed");
      }

      let pendingActions: AgentAction[] = [];
      const appliedSectionIds = new Set<string>();
      const sectionNotices: string[] = [];

      const applySection = (section: AgentSection) => {
        if (appliedSectionIds.has(section.id)) {
          return;
        }
        appliedSectionIds.add(section.id);
        emitAgentSectionCreate(section);
        sectionNotices.push(`已新增區塊：${section.title ?? section.id}`);
      };

      for await (const event of readAgentStream(response)) {
        if (event.type === "text_delta") {
          setMessages((prev) =>
            withMessageContent(prev, assistantMessageId, event.delta)
          );
          continue;
        }

        if (event.type === "ui") {
          setMessages((prev) => [
            ...prev,
            {
              id: makeId(),
              role: "assistant",
              content: "",
              ui: event.block,
            },
          ]);
          continue;
        }

        if (event.type === "section") {
          applySection(event.section);
          continue;
        }

        if (event.type === "actions") {
          pendingActions = mergeActions(event.response);
          continue;
        }

        if (event.type === "done") {
          pendingActions = mergeActions(event.response);
          if (Array.isArray(event.response.sections)) {
            for (const section of event.response.sections) {
              if (isAgentSection(section)) {
                applySection(section);
              }
            }
          }
          setMessages((prev) =>
            withMessageContentFallback(
              prev,
              assistantMessageId,
              event.response.answer || "目前沒有可用回覆，請再試一次。"
            )
          );
          continue;
        }

        if (event.type === "error") {
          throw new Error(event.error);
        }
      }

      runActions(pendingActions);
      appendSystemMessages(sectionNotices);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "system",
          content: `連線失敗：${message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 w-[360px] max-w-[calc(100vw-1rem)]">
        {!open ? (
          <Button
            type="button"
            className="ml-auto flex h-10 rounded-full bg-cyan-600 px-4 hover:bg-cyan-700"
            onClick={() => setOpen(true)}
          >
            <MessageCircle className="size-4" />
            Agent Chat
          </Button>
        ) : (
          <Card className="overflow-hidden border-slate-300 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
              <p className="text-sm font-semibold text-slate-700">Agent Chat</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="max-h-[320px] space-y-2 overflow-auto bg-slate-50 p-3">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-md px-2 py-1.5 text-sm ${
                    message.role === "assistant"
                      ? "border border-slate-200 bg-white text-slate-700"
                      : message.role === "user"
                        ? "bg-slate-900 text-white"
                        : "bg-amber-50 text-amber-900"
                  }`}
                >
                  {message.ui ? (
                    <AgentUiBlockRenderer block={message.ui} />
                  ) : (
                    <p>{message.content || "..."}</p>
                  )}
                </article>
              ))}
              {loading ? (
                <p className="text-xs text-slate-500">Agent thinking...</p>
              ) : null}
            </div>

            <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-slate-200 bg-white p-2">
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="例如：帶我去 pricing 並開比較"
                disabled={loading || !sessionId}
                className="h-8 text-xs"
              />
              <Button
                type="submit"
                size="icon"
                className="size-8 bg-cyan-600 hover:bg-cyan-700"
                disabled={loading || !input.trim() || !sessionId}
              >
                <Send className="size-4" />
              </Button>
            </form>
          </Card>
        )}
      </div>

      {activeModal ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 p-4"
          onClick={() => setOpenModalId(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
                  Agent Modal
                </p>
                <h3 id="agent-modal-title" className="text-lg font-semibold text-slate-800">
                  {activeModal.title}
                </h3>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpenModalId(null)}
              >
                Close
              </Button>
            </div>
            <p className="text-sm text-slate-600">{activeModal.body}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
