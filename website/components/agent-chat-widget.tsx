"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import type {
  AgentAction,
  AgentChatResponse,
  AgentUiBlock,
} from "@/lib/agent-contract";
import { isAgentUiBlock } from "@/lib/agent-contract";
import {
  AGENT_MODAL_IDS,
  AGENT_ROUTES,
  getModalById,
  getModalTitle,
  normalizeModalId,
  normalizePath,
} from "@/lib/agent-registry";
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

  const created = `session-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

function mergeActions(response: AgentChatResponse): AgentAction[] {
  const actions = [...(response.actions ?? [])];
  if (response.navigateTo && !actions.some((action) => action.type === "navigate")) {
    actions.push({ type: "navigate", to: response.navigateTo });
  }
  if (
    response.openModalId &&
    !actions.some((action) => action.type === "open_modal")
  ) {
    actions.push({ type: "open_modal", id: response.openModalId });
  }
  return actions;
}

function parseSseEvent(rawBlock: string): { event: string; data: string } | null {
  const lines = rawBlock
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return null;
  }

  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
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

    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: "user", content: text },
    ]);
    setInput("");
    const assistantMessageId = makeId();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
      },
    ]);

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
      if (!response.body) {
        throw new Error("Agent stream body is empty");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let pendingActions: AgentAction[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let eventBoundary = buffer.indexOf("\n\n");

        while (eventBoundary >= 0) {
          const rawBlock = buffer.slice(0, eventBoundary);
          buffer = buffer.slice(eventBoundary + 2);
          eventBoundary = buffer.indexOf("\n\n");

          const parsed = parseSseEvent(rawBlock);
          if (!parsed) {
            continue;
          }

          if (parsed.event === "text_delta") {
            const payload = JSON.parse(parsed.data) as { delta?: string };
            const delta = typeof payload.delta === "string" ? payload.delta : "";
            if (delta) {
              setMessages((prev) =>
                withMessageContent(prev, assistantMessageId, delta)
              );
            }
            continue;
          }

          if (parsed.event === "ui") {
            const payload = JSON.parse(parsed.data) as { block?: unknown };
            const block = payload.block;
            if (isAgentUiBlock(block)) {
              setMessages((prev) => [
                ...prev,
                {
                  id: makeId(),
                  role: "assistant",
                  content: "",
                  ui: block,
                },
              ]);
            }
            continue;
          }

          if (parsed.event === "actions") {
            const payload = JSON.parse(parsed.data) as AgentChatResponse;
            pendingActions = mergeActions(payload);
            continue;
          }

          if (parsed.event === "done") {
            const payload = JSON.parse(parsed.data) as AgentChatResponse;
            pendingActions = mergeActions(payload);
            setMessages((prev) =>
              withMessageContentFallback(
                prev,
                assistantMessageId,
                payload.answer || "目前沒有可用回覆，請再試一次。"
              )
            );
            continue;
          }

          if (parsed.event === "error") {
            const payload = JSON.parse(parsed.data) as { error?: string };
            throw new Error(payload.error || "Agent stream failed");
          }
        }
      }

      runActions(pendingActions);
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
                    <AgentUiRenderer block={message.ui} />
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

function AgentUiRenderer({ block }: { block: AgentUiBlock }) {
  if (block.type === "asset_donut") {
    return <AssetDonutBlock block={block} />;
  }
  return <FinanceTrendLineBlock block={block} />;
}

const DONUT_COLORS = ["#1f4bb8", "#6f8ee5", "#9eb4ec", "#c6d6f3", "#8ac4ff"];

function formatAudAmount(value: number) {
  return `AUD ${Math.round(value).toLocaleString("en-AU")}`;
}

function AssetDonutBlock({
  block,
}: {
  block: Extract<AgentUiBlock, { type: "asset_donut" }>;
}) {
  const total = block.items.reduce((sum, item) => sum + item.amount, 0);
  const fallbackTotal = total > 0 ? total : 1;
  let angle = 0;

  const gradient = block.items
    .map((item, index) => {
      const ratio = item.amount / fallbackTotal;
      const start = angle;
      angle += ratio * 360;
      const end = angle;
      const color = DONUT_COLORS[index % DONUT_COLORS.length] ?? "#1f4bb8";
      return `${color} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {block.title ?? "資產配置"}
      </p>
      <div className="grid grid-cols-[110px_1fr] gap-3">
        <div
          className="grid size-[110px] place-items-center rounded-full"
          style={{
            background:
              gradient ||
              "conic-gradient(#1f4bb8 0deg 359deg, #c6d6f3 359deg 360deg)",
          }}
        >
          <div className="grid size-[74px] place-items-center rounded-full bg-white text-center shadow-inner">
            <strong className="text-xs text-slate-800">
              {Math.round(total).toLocaleString("en-AU")}
            </strong>
            <span className="text-[10px] text-slate-500">Total</span>
          </div>
        </div>
        <ul className="space-y-1">
          {block.items.map((item, index) => {
            const percent = Math.round((item.amount / fallbackTotal) * 100);
            const color = DONUT_COLORS[index % DONUT_COLORS.length] ?? "#1f4bb8";
            return (
              <li
                key={`${item.label}-${index}`}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-slate-700">{item.label}</span>
                <span className="text-slate-500">
                  {formatAudAmount(item.amount)} ({percent}%)
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function FinanceTrendLineBlock({
  block,
}: {
  block: Extract<AgentUiBlock, { type: "finance_trend_line" }>;
}) {
  const width = 290;
  const height = 150;
  const padding = 18;
  const maxValue = Math.max(
    ...block.points.flatMap((point) => [point.assets, point.liabilities]),
    1
  );
  const xStep =
    block.points.length > 1
      ? (width - padding * 2) / (block.points.length - 1)
      : width - padding * 2;
  const yScale = (height - padding * 2) / maxValue;

  const toPointString = (key: "assets" | "liabilities") =>
    block.points
      .map((point, index) => {
        const x = padding + index * xStep;
        const y = height - padding - point[key] * yScale;
        return `${x},${y}`;
      })
      .join(" ");

  const assetsPoints = toPointString("assets");
  const liabilitiesPoints = toPointString("liabilities");
  const midIndex = Math.floor((block.points.length - 1) / 2);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {block.title ?? "資產與負債趨勢"}
      </p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Finance trend line chart"
        className="h-[150px] w-full rounded-md border border-slate-200 bg-white"
      >
        <line
          x1={padding}
          x2={width - padding}
          y1={height - padding}
          y2={height - padding}
          stroke="#d5dce7"
          strokeWidth="1"
        />
        <line
          x1={padding}
          x2={padding}
          y1={padding}
          y2={height - padding}
          stroke="#d5dce7"
          strokeWidth="1"
        />
        <polyline
          points={assetsPoints}
          fill="none"
          stroke="#1f4bb8"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={liabilitiesPoints}
          fill="none"
          stroke="#bf111b"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>{block.points[0]?.label}</span>
        <span>{block.points[midIndex]?.label}</span>
        <span>{block.points[block.points.length - 1]?.label}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-[#1f4bb8]" />
          Assets
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-[#bf111b]" />
          Liabilities
        </span>
      </div>
    </div>
  );
}
