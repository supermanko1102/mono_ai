"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import {
  AGENT_MODES,
  type AgentAction,
  type AgentCommand,
  type AgentMode,
  type AgentSection,
  type AgentUiBlock,
} from "@/lib/agent-contract";
import { isAgentSection, isAgentUiBlock } from "@/lib/agent-guards";
import { mergeActions, readAgentStream } from "@/lib/agent-stream";
import {
  AGENT_MODAL_IDS,
  AGENT_ROUTES,
  getModalById,
  getModalTitle,
  normalizeModalId,
  normalizePath,
} from "@/lib/agent-registry";
import {
  emitAgentSectionCreate,
  emitAgentSectionRemove,
} from "@/lib/runtime-section-events";
import { AgentUiBlockRenderer } from "@/components/agent-ui-block-renderer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAgentThreads } from "@/lib/hooks/use-agent-threads";
import { useAutoScroll } from "@/lib/hooks/use-auto-scroll";
import { useDebouncedEffect } from "@/lib/hooks/use-debounced-effect";
import { useEscapeKey } from "@/lib/hooks/use-escape-key";
import { useLatestRef } from "@/lib/hooks/use-latest-ref";

const MODE_KEY = "website-v1-agent-mode";

const MODE_LABELS: Record<AgentMode, string> = {
  default: "Default",
  sales: "Sales",
  tutor: "Tutor",
  support: "Support",
};

const MODE_HINTS: Record<AgentMode, string> = {
  default: "一般實用回覆",
  sales: "偏商務價值與轉換",
  tutor: "偏教學與結構化解釋",
  support: "偏排錯與客服語氣",
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  ui?: AgentUiBlock;
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createWelcomeMessage(): ChatMessage {
  return {
    id: makeId(),
    role: "assistant",
    content:
      "我是網站助理。你可以說：帶我去 docs 並開啟快速上手，或輸入 /mode tutor。",
  };
}

function normalizeMode(value: string | null | undefined): AgentMode {
  if (!value) {
    return "default";
  }
  const candidate = value.trim().toLowerCase();
  return AGENT_MODES.includes(candidate as AgentMode)
    ? (candidate as AgentMode)
    : "default";
}

function parseSlashCommand(text: string): AgentCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const tokens = trimmed
    .slice(1)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return null;
  }
  const [nameRaw, ...args] = tokens;
  const name = nameRaw.toLowerCase();
  if (name !== "mode" && name !== "summarize") {
    return null;
  }
  return {
    name,
    args,
  };
}

function extractModeFromCommand(command: AgentCommand | null): AgentMode | null {
  if (!command || command.name !== "mode") {
    return null;
  }
  const raw = command.args?.[0];
  if (!raw) {
    return null;
  }
  const nextMode = normalizeMode(raw);
  return nextMode === "default" && raw.toLowerCase() !== "default"
    ? null
    : nextMode;
}

function parseModeQuery(text: string): string | null {
  const match = text.trim().match(/^\/mode(?:\s+([a-zA-Z-]*))?$/i);
  if (!match) {
    return null;
  }
  return (match[1] ?? "").toLowerCase();
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

function upsertSection(list: AgentSection[], section: AgentSection): AgentSection[] {
  const index = list.findIndex((item) => item.id === section.id);
  if (index === -1) {
    return [...list, section];
  }
  const next = [...list];
  next[index] = section;
  return next;
}

function normalizePersistedMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const messages: ChatMessage[] = [];
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

    const message: ChatMessage = {
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

function normalizePersistedSections(value: unknown): AgentSection[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const sections: AgentSection[] = [];
  for (const item of value) {
    if (!isAgentSection(item) || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    sections.push(item);
  }
  return sections;
}

function toAgentHistory(messages: ChatMessage[]) {
  return messages
    .filter((message) => !message.ui)
    .filter((message) => message.content.trim().length > 0)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role === "assistant" ? ("model" as const) : ("user" as const),
      content: message.content,
    }))
    .slice(-20);
}

function deriveThreadTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(
    (message) => message.role === "user" && message.content.trim().length > 0
  );
  if (!firstUser) {
    return "新對話";
  }
  return firstUser.content.replace(/\s+/g, " ").trim().slice(0, 48);
}

export function AgentChatWidget() {
  const router = useRouter();
  const pathname = usePathname();
  const currentPath = normalizePath(pathname ?? "/");

  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<AgentMode>("default");
  const [openModalId, setOpenModalId] = useState<string | null>(null);
  const [persistedSections, setPersistedSections] = useState<AgentSection[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([createWelcomeMessage()]);

  const messagesRef = useLatestRef(messages);
  const modeRef = useLatestRef(mode);
  const sectionsRef = useLatestRef(persistedSections);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const activeModal = getModalById(openModalId);
  const routeOptions = useMemo(() => [...AGENT_ROUTES], []);
  const modalOptions = useMemo(() => [...AGENT_MODAL_IDS], []);

  const modeQuery = useMemo(() => parseModeQuery(input), [input]);
  const modeOptions = useMemo(() => {
    if (modeQuery === null) {
      return [] as AgentMode[];
    }
    return AGENT_MODES.filter((candidate) => candidate.includes(modeQuery));
  }, [modeQuery]);

  const setModeAndPersist = useCallback((nextMode: AgentMode) => {
    setMode(nextMode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODE_KEY, nextMode);
    }
  }, []);

  useEffect(() => {
    const storedMode = normalizeMode(window.localStorage.getItem(MODE_KEY));
    setModeAndPersist(storedMode);
  }, [setModeAndPersist]);

  const onThreadStateLoaded = useCallback(
    (state: { mode?: string; messages?: unknown; sections?: unknown } | null) => {
      const nextMode = normalizeMode(state?.mode);
      const nextMessages = normalizePersistedMessages(state?.messages);
      const nextSections = normalizePersistedSections(state?.sections);

      setPersistedSections((prev) => {
        for (const section of prev) {
          emitAgentSectionRemove(section.id);
        }
        return nextSections;
      });

      for (const section of nextSections) {
        emitAgentSectionCreate(section);
      }

      setModeAndPersist(nextMode);
      setMessages(nextMessages.length > 0 ? nextMessages : [createWelcomeMessage()]);
    },
    [setModeAndPersist]
  );

  const {
    visitorId,
    threadId,
    includeArchived,
    hydrated,
    activeThread,
    visibleThreads,
    threadLocked,
    setIncludeArchived,
    setThreadIdAndPersist,
    createThreadAndSwitch,
    toggleArchiveThread,
    updateActiveThread,
  } = useAgentThreads({
    modeRef,
    onThreadStateLoaded,
  });

  const showModePicker =
    modeQuery !== null &&
    !loading &&
    !!threadId &&
    !!visitorId &&
    hydrated &&
    !threadLocked;

  useEscapeKey({
    enabled: !!activeModal,
    onEscape: () => setOpenModalId(null),
  });

  useAutoScroll(messagesContainerRef, {
    enabled: open,
    deps: [messages, loading],
  });

  useDebouncedEffect(
    () => {
      if (!visitorId || !threadId || !hydrated || loading) {
        return;
      }

      const title = deriveThreadTitle(messagesRef.current);

      void fetch(
        `/api/agent/chat/threads/${encodeURIComponent(threadId)}/state`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            visitorId,
            mode: modeRef.current,
            title,
            messages: messagesRef.current,
            sections: sectionsRef.current,
          }),
        }
      ).then(() => {
        updateActiveThread((current) => {
          const lastMessage = messagesRef.current
            .slice()
            .reverse()
            .find((msg) => !msg.ui && msg.content.trim());
          return {
            ...current,
            mode: modeRef.current,
            title: title || current.title,
            updatedAt: new Date().toISOString(),
            messageCount: messagesRef.current.filter((msg) => !msg.ui).length,
            lastMessagePreview: lastMessage
              ? lastMessage.content.slice(0, 80)
              : current.lastMessagePreview,
          };
        });
      });
    },
    200,
    [
      visitorId,
      threadId,
      hydrated,
      loading,
      messages,
      mode,
      persistedSections,
      updateActiveThread,
    ]
  );

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
    if (
      !text ||
      loading ||
      !threadId ||
      !visitorId ||
      !hydrated ||
      threadLocked
    ) {
      return;
    }

    const command = parseSlashCommand(text);
    const optimisticMode = extractModeFromCommand(command);
    const requestMode = optimisticMode ?? mode;
    if (optimisticMode) {
      setModeAndPersist(optimisticMode);
    }

    const history = toAgentHistory(messagesRef.current);
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
          sessionId: threadId,
          message: text,
          history,
          mode: requestMode,
          command: command ?? undefined,
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
        setPersistedSections((prev) => upsertSection(prev, section));
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
          const responseMode = normalizeMode(event.response.mode);
          setModeAndPersist(responseMode);
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

      updateActiveThread((current) => {
        return {
          ...current,
          updatedAt: new Date().toISOString(),
          mode: modeRef.current,
        };
      });
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

  function applyModeOption(nextMode: AgentMode) {
    setInput(`/mode ${nextMode}`);
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 w-[520px] max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)]">
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
            <div className="space-y-2 border-b border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-700">Agent Chat</p>
                  <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-800">
                    {MODE_LABELS[mode]}
                  </span>
                </div>
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

              <div className="flex items-center gap-2">
                <select
                  value={threadId}
                  onChange={(event) => setThreadIdAndPersist(event.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
                  disabled={!hydrated && !!threadId}
                >
                  {visibleThreads.map((thread) => (
                    <option key={thread.id} value={thread.id}>
                      {thread.status === "archived" ? "[封存] " : ""}
                      {thread.title}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    void createThreadAndSwitch();
                  }}
                  disabled={!visitorId || loading}
                >
                  新對話
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    void toggleArchiveThread();
                  }}
                  disabled={!activeThread || loading}
                >
                  {threadLocked ? "取消封存" : "封存"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setIncludeArchived((prev) => !prev)}
                >
                  {includeArchived ? "隱藏封存" : "顯示封存"}
                </Button>
              </div>
            </div>

            <div
              ref={messagesContainerRef}
              className="max-h-[460px] min-h-[340px] space-y-2 overflow-auto bg-slate-50 p-3"
            >
              {threadLocked ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                  這個對話串已封存。可按「取消封存」後繼續對話。
                </p>
              ) : null}

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

            <div className="relative border-t border-slate-200 bg-white p-2">
              {showModePicker ? (
                <div className="absolute inset-x-2 bottom-full mb-2 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                  {modeOptions.length > 0 ? (
                    modeOptions.map((candidate) => (
                      <button
                        key={candidate}
                        type="button"
                        onClick={() => applyModeOption(candidate)}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
                      >
                        <span className="font-semibold text-slate-800">{`/mode ${candidate}`}</span>
                        <span className="text-slate-500">{MODE_HINTS[candidate]}</span>
                      </button>
                    ))
                  ) : (
                    <p className="px-2 py-1.5 text-xs text-slate-500">沒有符合的模式</p>
                  )}
                </div>
              ) : null}

              <form onSubmit={onSubmit} className="flex items-center gap-2">
                <Input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="例如：/mode tutor 或 帶我去 pricing"
                  disabled={
                    loading || !threadId || !visitorId || !hydrated || threadLocked
                  }
                  className="h-8 text-xs"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="size-8 bg-cyan-600 hover:bg-cyan-700"
                  disabled={
                    loading ||
                    !input.trim() ||
                    !threadId ||
                    !visitorId ||
                    !hydrated ||
                    threadLocked
                  }
                >
                  <Send className="size-4" />
                </Button>
              </form>
            </div>
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
