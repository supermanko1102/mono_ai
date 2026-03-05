import { useCallback, useEffect, useMemo, useState } from "react";
import type { MutableRefObject } from "react";

import type { AgentMode } from "@/lib/agent-contract";
import { useLatestRef } from "@/lib/hooks/use-latest-ref";

const VISITOR_KEY = "website-v1-agent-visitor-id";
const THREAD_KEY = "website-v1-agent-thread-id";

export type AgentThreadStatus = "active" | "archived";

export type AgentThreadSummary = {
  id: string;
  title: string;
  status: AgentThreadStatus;
  mode: AgentMode;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  messageCount: number;
  lastMessagePreview?: string;
};

type LoadedThreadState = {
  mode?: string;
  messages?: unknown;
  sections?: unknown;
} | null;

function getOrCreateVisitorId() {
  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing) {
    return existing;
  }

  const created = `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(VISITOR_KEY, created);
  return created;
}

function normalizeThreadStatus(value: unknown): AgentThreadStatus {
  return value === "archived" ? "archived" : "active";
}

function normalizeThreadMode(value: unknown): AgentMode {
  if (
    value === "default" ||
    value === "sales" ||
    value === "tutor" ||
    value === "support"
  ) {
    return value;
  }
  return "default";
}

function normalizeThread(value: unknown): AgentThreadSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!id) {
    return null;
  }
  const titleRaw = typeof row.title === "string" ? row.title.trim() : "";
  return {
    id,
    title: titleRaw || "新對話",
    status: normalizeThreadStatus(row.status),
    mode: normalizeThreadMode(row.mode),
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
    archivedAt: typeof row.archivedAt === "string" ? row.archivedAt : undefined,
    messageCount:
      typeof row.messageCount === "number" && Number.isFinite(row.messageCount)
        ? Math.max(0, Math.trunc(row.messageCount))
        : 0,
    lastMessagePreview:
      typeof row.lastMessagePreview === "string" ? row.lastMessagePreview : undefined,
  };
}

function sortThreads(threads: AgentThreadSummary[]): AgentThreadSummary[] {
  return [...threads].sort((left, right) => {
    if (left.updatedAt === right.updatedAt) {
      return right.id.localeCompare(left.id);
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function upsertThread(
  list: AgentThreadSummary[],
  thread: AgentThreadSummary
): AgentThreadSummary[] {
  const index = list.findIndex((item) => item.id === thread.id);
  if (index === -1) {
    return sortThreads([thread, ...list]);
  }
  const next = [...list];
  next[index] = thread;
  return sortThreads(next);
}

export function useAgentThreads(options: {
  enabled: boolean;
  modeRef: MutableRefObject<AgentMode>;
  onThreadStateLoaded: (state: LoadedThreadState) => void;
}) {
  const { enabled, modeRef, onThreadStateLoaded } = options;
  const onThreadStateLoadedRef = useLatestRef(onThreadStateLoaded);

  const [visitorId, setVisitorId] = useState("");
  const [threadId, setThreadId] = useState("");
  const [threads, setThreads] = useState<AgentThreadSummary[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const threadsRef = useLatestRef(threads);

  const setThreadIdAndPersist = useCallback((nextThreadId: string) => {
    setThreadId(nextThreadId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THREAD_KEY, nextThreadId);
    }
  }, []);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === threadId) ?? null,
    [threads, threadId]
  );

  const visibleThreads = useMemo(() => {
    const base = includeArchived
      ? threads
      : threads.filter((thread) => thread.status === "active");
    if (activeThread && !base.some((thread) => thread.id === activeThread.id)) {
      return [activeThread, ...base];
    }
    return base;
  }, [threads, includeArchived, activeThread]);

  const threadLocked = activeThread?.status === "archived";

  const updateActiveThread = useCallback(
    (updater: (current: AgentThreadSummary) => AgentThreadSummary) => {
      setThreads((prev) => {
        const current = prev.find((thread) => thread.id === threadId);
        if (!current) {
          return prev;
        }
        return upsertThread(prev, updater(current));
      });
    },
    [threadId]
  );

  const createThreadAndSwitch = useCallback(async () => {
    if (!visitorId) {
      return;
    }

    const response = await fetch("/api/agent/chat/threads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        visitorId,
        mode: modeRef.current,
      }),
    });
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { thread?: unknown };
    const created = normalizeThread(payload.thread);
    if (!created) {
      return;
    }

    setThreads((prev) => upsertThread(prev, created));
    setThreadIdAndPersist(created.id);
  }, [modeRef, setThreadIdAndPersist, visitorId]);

  const toggleArchiveThread = useCallback(async () => {
    if (!visitorId || !activeThread) {
      return;
    }

    const targetArchived = activeThread.status !== "archived";
    const response = await fetch(
      `/api/agent/chat/threads/${encodeURIComponent(activeThread.id)}/archive`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          visitorId,
          archived: targetArchived,
        }),
      }
    );
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { thread?: unknown };
    const updated = normalizeThread(payload.thread);
    if (!updated) {
      return;
    }

    setThreads((prev) => upsertThread(prev, updated));

    if (targetArchived) {
      const fallback = threadsRef.current.find(
        (thread) => thread.id !== activeThread.id && thread.status === "active"
      );
      if (fallback) {
        setThreadIdAndPersist(fallback.id);
      } else {
        await createThreadAndSwitch();
      }
    }
  }, [
    activeThread,
    createThreadAndSwitch,
    setThreadIdAndPersist,
    threadsRef,
    visitorId,
  ]);

  useEffect(() => {
    if (!enabled) {
      setVisitorId("");
      setThreadId("");
      setThreads([]);
      setHydrated(false);
      return;
    }
    setVisitorId(getOrCreateVisitorId());
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !visitorId) {
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      const response = await fetch(
        `/api/agent/chat/threads?visitorId=${encodeURIComponent(
          visitorId
        )}&status=all&limit=100`,
        {
          cache: "no-store",
        }
      );

      let fetchedThreads: AgentThreadSummary[] = [];
      if (response.ok) {
        const payload = (await response.json()) as { threads?: unknown[] };
        fetchedThreads = Array.isArray(payload.threads)
          ? payload.threads
              .map((item) => normalizeThread(item))
              .filter((item): item is AgentThreadSummary => item !== null)
          : [];
      }

      if (fetchedThreads.length === 0) {
        const createdResponse = await fetch("/api/agent/chat/threads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            visitorId,
            mode: modeRef.current,
          }),
        });
        if (createdResponse.ok) {
          const payload = (await createdResponse.json()) as { thread?: unknown };
          const created = normalizeThread(payload.thread);
          if (created) {
            fetchedThreads = [created];
          }
        }
      }

      if (cancelled) {
        return;
      }

      const sorted = sortThreads(fetchedThreads);
      setThreads(sorted);

      const storedThreadId = window.localStorage.getItem(THREAD_KEY) ?? "";
      const storedExists = sorted.some((thread) => thread.id === storedThreadId);
      const defaultThread =
        sorted.find((thread) => thread.status === "active") ?? sorted[0] ?? null;
      const nextThreadId = storedExists ? storedThreadId : defaultThread?.id ?? "";

      if (nextThreadId) {
        setThreadIdAndPersist(nextThreadId);
      } else {
        setHydrated(true);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [enabled, modeRef, setThreadIdAndPersist, visitorId]);

  useEffect(() => {
    if (!enabled || !visitorId || !threadId) {
      return;
    }

    let cancelled = false;
    setHydrated(false);

    const loadThreadState = async () => {
      try {
        const response = await fetch(
          `/api/agent/chat/threads/${encodeURIComponent(
            threadId
          )}/state?visitorId=${encodeURIComponent(visitorId)}`,
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          onThreadStateLoadedRef.current(null);
          return;
        }

        const payload = (await response.json()) as {
          state?: LoadedThreadState;
        };
        if (cancelled) {
          return;
        }

        onThreadStateLoadedRef.current(payload.state ?? null);
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    };

    void loadThreadState();

    return () => {
      cancelled = true;
    };
  }, [enabled, onThreadStateLoadedRef, threadId, visitorId]);

  return {
    visitorId,
    threadId,
    threads,
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
  };
}
