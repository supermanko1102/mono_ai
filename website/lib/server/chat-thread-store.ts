import type { AgentMode, AgentSection, AgentUiBlock } from "@/lib/agent-contract";
import { AGENT_MODES } from "@/lib/agent-contract";
import { isAgentSection, isAgentUiBlock } from "@/lib/agent-guards";
import { getDb } from "@/lib/server/db";

export type ThreadStatus = "active" | "archived";
export type PersistedChatRole = "assistant" | "user" | "system";

export type PersistedChatMessage = {
  id: string;
  role: PersistedChatRole;
  content: string;
  ui?: AgentUiBlock;
};

export type ChatThreadSummary = {
  id: string;
  title: string;
  status: ThreadStatus;
  mode: AgentMode;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  messageCount: number;
  lastMessagePreview?: string;
};

export type ChatThreadState = {
  threadId: string;
  visitorId: string;
  title: string;
  status: ThreadStatus;
  mode: AgentMode;
  messages: PersistedChatMessage[];
  sections: AgentSection[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

let schemaReady = false;

function makeThreadId() {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureSchema() {
  if (schemaReady) {
    return;
  }
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_threads (
      thread_id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '新對話',
      status TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active',
      mode TEXT NOT NULL DEFAULT 'default',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chat_threads_visitor_status_updated
      ON chat_threads(visitor_id, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_thread_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('assistant', 'user', 'system')),
      content TEXT NOT NULL,
      ui_json TEXT,
      seq INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(thread_id, message_id),
      FOREIGN KEY(thread_id) REFERENCES chat_threads(thread_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chat_thread_messages_thread_seq
      ON chat_thread_messages(thread_id, seq);

    CREATE TABLE IF NOT EXISTS chat_thread_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(thread_id, section_id),
      FOREIGN KEY(thread_id) REFERENCES chat_threads(thread_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chat_thread_sections_thread
      ON chat_thread_sections(thread_id);
  `);
  schemaReady = true;
}

function normalizeMode(mode: string | undefined): AgentMode {
  if (!mode) {
    return "default";
  }
  const candidate = mode.trim().toLowerCase();
  return AGENT_MODES.includes(candidate as AgentMode)
    ? (candidate as AgentMode)
    : "default";
}

function normalizeTitle(title: string | undefined): string {
  const trimmed = (title ?? "").trim();
  if (!trimmed) {
    return "新對話";
  }
  return trimmed.slice(0, 80);
}

function normalizeStatus(status: string | undefined): ThreadStatus {
  return status === "archived" ? "archived" : "active";
}

function previewFromContent(content: string | null): string | undefined {
  if (!content) {
    return undefined;
  }
  const trimmed = content.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, 80) : undefined;
}

function normalizeMessage(message: PersistedChatMessage): PersistedChatMessage | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  if (
    message.role !== "assistant" &&
    message.role !== "user" &&
    message.role !== "system"
  ) {
    return null;
  }
  const id = String(message.id ?? "").trim();
  if (!id) {
    return null;
  }
  const content = String(message.content ?? "");
  const normalized: PersistedChatMessage = {
    id,
    role: message.role,
    content,
  };
  if (message.ui && isAgentUiBlock(message.ui)) {
    normalized.ui = message.ui;
  }
  if (!normalized.content.trim() && !normalized.ui) {
    return null;
  }
  return normalized;
}

function normalizeSections(sections: AgentSection[]): AgentSection[] {
  const seen = new Set<string>();
  const normalized: AgentSection[] = [];
  for (const section of sections) {
    if (!isAgentSection(section) || seen.has(section.id)) {
      continue;
    }
    seen.add(section.id);
    normalized.push(section);
  }
  return normalized;
}

function safeParseUi(value: string | null): AgentUiBlock | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return isAgentUiBlock(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function safeParseSection(value: string): AgentSection | null {
  try {
    const parsed = JSON.parse(value);
    return isAgentSection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function mapSummaryRow(row: {
  id: string;
  title: string;
  status: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  messageCount: number;
  lastMessage: string | null;
}): ChatThreadSummary {
  return {
    id: row.id,
    title: normalizeTitle(row.title),
    status: normalizeStatus(row.status),
    mode: normalizeMode(row.mode),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.archivedAt ? { archivedAt: row.archivedAt } : {}),
    messageCount: Number(row.messageCount ?? 0),
    ...(previewFromContent(row.lastMessage)
      ? { lastMessagePreview: previewFromContent(row.lastMessage) }
      : {}),
  };
}

export function listChatThreads(input: {
  visitorId: string;
  status?: ThreadStatus | "all";
  limit?: number;
}): ChatThreadSummary[] {
  ensureSchema();
  const visitorId = input.visitorId.trim();
  if (!visitorId) {
    return [];
  }
  const status = input.status ?? "active";
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 40)));
  const db = getDb();

  const baseSql = `
    SELECT
      t.thread_id as id,
      t.title as title,
      t.status as status,
      t.mode as mode,
      t.created_at as createdAt,
      t.updated_at as updatedAt,
      t.archived_at as archivedAt,
      COALESCE(
        (
          SELECT COUNT(*)
          FROM chat_thread_messages m
          WHERE m.thread_id = t.thread_id
        ),
        0
      ) as messageCount,
      (
        SELECT m.content
        FROM chat_thread_messages m
        WHERE m.thread_id = t.thread_id
        ORDER BY m.seq DESC, m.id DESC
        LIMIT 1
      ) as lastMessage
    FROM chat_threads t
    WHERE t.visitor_id = ?
  `;

  const rows = (status === "all"
    ? db
        .prepare(`${baseSql} ORDER BY t.updated_at DESC LIMIT ?`)
        .all(visitorId, limit)
    : db
        .prepare(
          `${baseSql} AND t.status = ? ORDER BY t.updated_at DESC LIMIT ?`
        )
        .all(visitorId, status, limit)) as Array<{
    id: string;
    title: string;
    status: string;
    mode: string;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
    messageCount: number;
    lastMessage: string | null;
  }>;

  return rows.map(mapSummaryRow);
}

export function createChatThread(input: {
  visitorId: string;
  title?: string;
  mode?: AgentMode;
}): ChatThreadSummary {
  ensureSchema();
  const visitorId = input.visitorId.trim();
  if (!visitorId) {
    throw new Error("visitorId is required");
  }

  const threadId = makeThreadId();
  const title = normalizeTitle(input.title);
  const mode = normalizeMode(input.mode);
  const db = getDb();
  db.prepare(
    `INSERT INTO chat_threads (
       thread_id,
       visitor_id,
       title,
       status,
       mode
     ) VALUES (?, ?, ?, 'active', ?)`
  ).run(threadId, visitorId, title, mode);

  const created = getChatThreadSummary({
    threadId,
    visitorId,
  });
  if (!created) {
    throw new Error("failed to create thread");
  }
  return created;
}

export function getChatThreadSummary(input: {
  threadId: string;
  visitorId: string;
}): ChatThreadSummary | null {
  ensureSchema();
  const threadId = input.threadId.trim();
  const visitorId = input.visitorId.trim();
  if (!threadId || !visitorId) {
    return null;
  }

  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT
        t.thread_id as id,
        t.title as title,
        t.status as status,
        t.mode as mode,
        t.created_at as createdAt,
        t.updated_at as updatedAt,
        t.archived_at as archivedAt,
        COALESCE(
          (
            SELECT COUNT(*)
            FROM chat_thread_messages m
            WHERE m.thread_id = t.thread_id
          ),
          0
        ) as messageCount,
        (
          SELECT m.content
          FROM chat_thread_messages m
          WHERE m.thread_id = t.thread_id
          ORDER BY m.seq DESC, m.id DESC
          LIMIT 1
        ) as lastMessage
      FROM chat_threads t
      WHERE t.thread_id = ? AND t.visitor_id = ?
      `
    )
    .get(threadId, visitorId) as
    | {
        id: string;
        title: string;
        status: string;
        mode: string;
        createdAt: string;
        updatedAt: string;
        archivedAt: string | null;
        messageCount: number;
        lastMessage: string | null;
      }
    | undefined;

  return row ? mapSummaryRow(row) : null;
}

export function loadChatThreadState(input: {
  threadId: string;
  visitorId: string;
}): ChatThreadState | null {
  ensureSchema();
  const threadId = input.threadId.trim();
  const visitorId = input.visitorId.trim();
  if (!threadId || !visitorId) {
    return null;
  }

  const db = getDb();
  const threadRow = db
    .prepare(
      `SELECT
         thread_id as threadId,
         visitor_id as visitorId,
         title as title,
         status as status,
         mode as mode,
         created_at as createdAt,
         updated_at as updatedAt,
         archived_at as archivedAt
       FROM chat_threads
       WHERE thread_id = ? AND visitor_id = ?`
    )
    .get(threadId, visitorId) as
    | {
        threadId: string;
        visitorId: string;
        title: string;
        status: string;
        mode: string;
        createdAt: string;
        updatedAt: string;
        archivedAt: string | null;
      }
    | undefined;

  if (!threadRow) {
    return null;
  }

  const messageRows = db
    .prepare(
      `SELECT message_id as id, role, content, ui_json as uiJson
       FROM chat_thread_messages
       WHERE thread_id = ?
       ORDER BY seq ASC, id ASC`
    )
    .all(threadId) as Array<{
    id: string;
    role: PersistedChatRole;
    content: string;
    uiJson: string | null;
  }>;

  const sectionRows = db
    .prepare(
      `SELECT payload_json as payloadJson
       FROM chat_thread_sections
       WHERE thread_id = ?
       ORDER BY id ASC`
    )
    .all(threadId) as Array<{
    payloadJson: string;
  }>;

  return {
    threadId: threadRow.threadId,
    visitorId: threadRow.visitorId,
    title: normalizeTitle(threadRow.title),
    status: normalizeStatus(threadRow.status),
    mode: normalizeMode(threadRow.mode),
    createdAt: threadRow.createdAt,
    updatedAt: threadRow.updatedAt,
    ...(threadRow.archivedAt ? { archivedAt: threadRow.archivedAt } : {}),
    messages: messageRows
      .map((row) =>
        normalizeMessage({
          id: row.id,
          role: row.role,
          content: row.content,
          ui: safeParseUi(row.uiJson),
        })
      )
      .filter((item): item is PersistedChatMessage => item !== null),
    sections: sectionRows
      .map((row) => safeParseSection(row.payloadJson))
      .filter((item): item is AgentSection => item !== null),
  };
}

export function saveChatThreadState(input: {
  threadId: string;
  visitorId: string;
  mode: AgentMode;
  messages: PersistedChatMessage[];
  sections: AgentSection[];
  title?: string;
}): ChatThreadState {
  ensureSchema();
  const threadId = input.threadId.trim();
  const visitorId = input.visitorId.trim();
  if (!threadId) {
    throw new Error("threadId is required");
  }
  if (!visitorId) {
    throw new Error("visitorId is required");
  }

  const mode = normalizeMode(input.mode);
  const title = normalizeTitle(input.title);
  const messages = input.messages
    .map((item) => normalizeMessage(item))
    .filter((item): item is PersistedChatMessage => item !== null)
    .slice(-300);
  const sections = normalizeSections(input.sections).slice(-40);

  const db = getDb();
  const upsertThread = db.prepare(
    `INSERT INTO chat_threads (
       thread_id,
       visitor_id,
       title,
       status,
       mode,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(thread_id) DO UPDATE SET
       visitor_id = excluded.visitor_id,
       title = excluded.title,
       mode = excluded.mode,
       updated_at = CURRENT_TIMESTAMP`
  );
  const deleteMessages = db.prepare(
    `DELETE FROM chat_thread_messages WHERE thread_id = ?`
  );
  const insertMessage = db.prepare(
    `INSERT INTO chat_thread_messages (
       thread_id,
       message_id,
       role,
       content,
       ui_json,
       seq
     ) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const deleteSections = db.prepare(
    `DELETE FROM chat_thread_sections WHERE thread_id = ?`
  );
  const insertSection = db.prepare(
    `INSERT INTO chat_thread_sections (
       thread_id,
       section_id,
       payload_json
     ) VALUES (?, ?, ?)`
  );

  const tx = db.transaction(() => {
    upsertThread.run(threadId, visitorId, title, mode);

    deleteMessages.run(threadId);
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      insertMessage.run(
        threadId,
        message.id,
        message.role,
        message.content,
        message.ui ? JSON.stringify(message.ui) : null,
        index
      );
    }

    deleteSections.run(threadId);
    for (const section of sections) {
      insertSection.run(threadId, section.id, JSON.stringify(section));
    }
  });
  tx();

  const state = loadChatThreadState({ threadId, visitorId });
  if (!state) {
    throw new Error("failed to save thread state");
  }
  return state;
}

export function setChatThreadArchived(input: {
  threadId: string;
  visitorId: string;
  archived: boolean;
}): ChatThreadSummary | null {
  ensureSchema();
  const threadId = input.threadId.trim();
  const visitorId = input.visitorId.trim();
  if (!threadId || !visitorId) {
    return null;
  }

  const status: ThreadStatus = input.archived ? "archived" : "active";
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE chat_threads
       SET status = ?,
           archived_at = CASE WHEN ? = 'archived' THEN CURRENT_TIMESTAMP ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE thread_id = ? AND visitor_id = ?`
    )
    .run(status, status, threadId, visitorId);

  if (result.changes === 0) {
    return null;
  }

  return getChatThreadSummary({ threadId, visitorId });
}
