import type { AgentMode, AgentSection, AgentUiBlock } from "@/lib/agent-contract";
import { AGENT_MODES } from "@/lib/agent-contract";
import { isAgentSection, isAgentUiBlock } from "@/lib/agent-guards";
import { getDb } from "@/lib/server/db";

export type PersistedChatRole = "assistant" | "user" | "system";

export type PersistedChatMessage = {
  id: string;
  role: PersistedChatRole;
  content: string;
  ui?: AgentUiBlock;
};

export type PersistedChatState = {
  sessionId: string;
  mode: AgentMode;
  messages: PersistedChatMessage[];
  sections: AgentSection[];
  updatedAt: string;
};

let chatSchemaReady = false;

function ensureChatSchema() {
  if (chatSchemaReady) {
    return;
  }

  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      session_id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'default',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('assistant', 'user', 'system')),
      content TEXT NOT NULL,
      ui_json TEXT,
      seq INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, message_id),
      FOREIGN KEY(session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_seq
      ON chat_messages(session_id, seq);

    CREATE TABLE IF NOT EXISTS chat_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, section_id),
      FOREIGN KEY(session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chat_sections_session
      ON chat_sections(session_id);
  `);

  chatSchemaReady = true;
}

function normalizeMode(mode: string | undefined): AgentMode {
  if (!mode) {
    return "default";
  }
  const value = mode.trim().toLowerCase();
  return AGENT_MODES.includes(value as AgentMode) ? (value as AgentMode) : "default";
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
  if (!content.trim() && !message.ui) {
    return null;
  }
  const normalized: PersistedChatMessage = {
    id,
    role: message.role,
    content,
  };
  if (message.ui && isAgentUiBlock(message.ui)) {
    normalized.ui = message.ui;
  }
  return normalized;
}

function normalizeSections(sections: AgentSection[]): AgentSection[] {
  const seen = new Set<string>();
  const output: AgentSection[] = [];
  for (const section of sections) {
    if (!isAgentSection(section) || seen.has(section.id)) {
      continue;
    }
    seen.add(section.id);
    output.push(section);
  }
  return output;
}

export function loadChatState(sessionId: string): PersistedChatState | null {
  ensureChatSchema();
  const trimmedSessionId = sessionId.trim();
  if (!trimmedSessionId) {
    return null;
  }

  const db = getDb();
  const sessionRow = db
    .prepare(
      `SELECT session_id as sessionId, mode, updated_at as updatedAt
       FROM chat_sessions
       WHERE session_id = ?`
    )
    .get(trimmedSessionId) as
    | {
        sessionId: string;
        mode: string;
        updatedAt: string;
      }
    | undefined;

  if (!sessionRow) {
    return null;
  }

  const messageRows = db
    .prepare(
      `SELECT message_id as id, role, content, ui_json as uiJson
       FROM chat_messages
       WHERE session_id = ?
       ORDER BY seq ASC`
    )
    .all(trimmedSessionId) as Array<{
    id: string;
    role: PersistedChatRole;
    content: string;
    uiJson: string | null;
  }>;

  const sectionRows = db
    .prepare(
      `SELECT payload_json as payloadJson
       FROM chat_sections
       WHERE session_id = ?
       ORDER BY id ASC`
    )
    .all(trimmedSessionId) as Array<{
    payloadJson: string;
  }>;

  return {
    sessionId: sessionRow.sessionId,
    mode: normalizeMode(sessionRow.mode),
    updatedAt: sessionRow.updatedAt,
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

export function saveChatState(input: {
  sessionId: string;
  mode: AgentMode;
  messages: PersistedChatMessage[];
  sections: AgentSection[];
}) {
  ensureChatSchema();
  const sessionId = input.sessionId.trim();
  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const mode = normalizeMode(input.mode);
  const messages = input.messages
    .map((message) => normalizeMessage(message))
    .filter((item): item is PersistedChatMessage => item !== null)
    .slice(-200);
  const sections = normalizeSections(input.sections).slice(-30);

  const db = getDb();
  const upsertSession = db.prepare(
    `INSERT INTO chat_sessions (session_id, mode, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(session_id) DO UPDATE SET
       mode = excluded.mode,
       updated_at = CURRENT_TIMESTAMP`
  );
  const deleteMessages = db.prepare(
    `DELETE FROM chat_messages WHERE session_id = ?`
  );
  const insertMessage = db.prepare(
    `INSERT INTO chat_messages (
       session_id,
       message_id,
       role,
       content,
       ui_json,
       seq
     ) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const deleteSections = db.prepare(
    `DELETE FROM chat_sections WHERE session_id = ?`
  );
  const insertSection = db.prepare(
    `INSERT INTO chat_sections (session_id, section_id, payload_json)
     VALUES (?, ?, ?)`
  );

  const tx = db.transaction(() => {
    upsertSession.run(sessionId, mode);
    deleteMessages.run(sessionId);
    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      insertMessage.run(
        sessionId,
        message.id,
        message.role,
        message.content,
        message.ui ? JSON.stringify(message.ui) : null,
        index
      );
    }

    deleteSections.run(sessionId);
    for (const section of sections) {
      insertSection.run(sessionId, section.id, JSON.stringify(section));
    }
  });
  tx();

  return loadChatState(sessionId);
}
