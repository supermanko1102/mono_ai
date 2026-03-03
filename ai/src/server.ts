import 'dotenv/config';

import { expressHandler } from '@genkit-ai/express';
import express from 'express';
import { z } from 'genkit';

import {
  AgentHistoryMessageSchema,
  AgentInputSchema,
  aiAgentFlow,
  type AgentOutput,
  streamAgent,
} from './ai/agent.js';
import {
  AGENT_COMMAND_NAMES,
  AGENT_MODES,
  type AgentModeContract,
} from './shared/agent-contract.js';

const ChatRequestSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
  history: z.array(AgentHistoryMessageSchema).optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  availableRoutes: z.array(z.string()).optional(),
  availableModals: z.array(z.string()).optional(),
  mode: z.enum(AGENT_MODES).optional(),
  command: z
    .object({
      name: z.enum(AGENT_COMMAND_NAMES),
      args: z.array(z.string()).optional(),
    })
    .optional(),
});

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3010);

type SessionHistoryMessage = z.infer<typeof AgentHistoryMessageSchema>;
type ChatRequest = z.infer<typeof ChatRequestSchema>;
type ChatCommand = NonNullable<ChatRequest['command']>;
type SessionState = {
  history: SessionHistoryMessage[];
  mode: AgentModeContract;
};

const sessions = new Map<string, SessionState>();

const VALID_MODES = new Set<AgentModeContract>(AGENT_MODES);

function toAgentInput(
  body: ChatRequest,
  state: SessionState
) {
  return AgentInputSchema.parse({
    message: body.message,
    history: state.history.length > 0 ? state.history : body.history ?? [],
    timezone: body.timezone,
    locale: body.locale,
    availableRoutes: body.availableRoutes,
    availableModals: body.availableModals,
    mode: state.mode,
  });
}

function resolveMode(
  requestedMode: string | undefined,
  fallbackMode: AgentModeContract
): AgentModeContract {
  if (!requestedMode) {
    return fallbackMode;
  }
  return VALID_MODES.has(requestedMode as AgentModeContract)
    ? (requestedMode as AgentModeContract)
    : fallbackMode;
}

function getSessionState(
  sessionId: string,
  requestedMode: string | undefined
): SessionState {
  const existing = sessions.get(sessionId);
  if (existing) {
    return {
      ...existing,
      mode: resolveMode(requestedMode, existing.mode),
    };
  }

  return {
    history: [],
    mode: resolveMode(requestedMode, 'default'),
  };
}

function updateSessionStateWithHistory({
  sessionId,
  prevState,
  userMessage,
  modelAnswer,
}: {
  sessionId: string;
  prevState: SessionState;
  userMessage: string;
  modelAnswer: string;
}) {
  const nextHistory = [
    ...prevState.history,
    { role: 'user', content: userMessage } as const,
    { role: 'model', content: modelAnswer } as const,
  ].slice(-20);
  const nextState: SessionState = {
    ...prevState,
    history: nextHistory,
  };
  sessions.set(sessionId, nextState);
  return nextState;
}

function parseSlashCommand(message: string): ChatCommand | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/')) {
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
  if (name !== 'mode' && name !== 'summarize') {
    return null;
  }
  return {
    name,
    args,
  };
}

function buildCommandResponse({
  sessionId,
  historyCount,
  mode,
  command,
  answer,
  ok,
}: {
  sessionId: string;
  historyCount: number;
  mode: AgentModeContract;
  command: ChatCommand;
  answer: string;
  ok: boolean;
}): {
  sessionId: string;
  answer: string;
  mode: AgentModeContract;
  historyCount: number;
  commandResult: {
    name: ChatCommand['name'];
    ok: boolean;
  };
  usedTools: string[];
  actions: [];
  ui: [];
  sections: [];
} {
  return {
    sessionId,
    answer,
    mode,
    historyCount,
    commandResult: {
      name: command.name,
      ok,
    },
    usedTools: [],
    actions: [],
    ui: [],
    sections: [],
  };
}

function handleModeCommand({
  command,
  state,
}: {
  command: ChatCommand;
  state: SessionState;
}): {
  answer: string;
  nextMode: AgentModeContract;
  ok: boolean;
} {
  const requestedRaw = command.args?.[0]?.toLowerCase();
  if (!requestedRaw) {
    return {
      answer: `目前模式是 ${state.mode}。可用模式：${AGENT_MODES.join(', ')}。`,
      nextMode: state.mode,
      ok: false,
    };
  }
  if (!VALID_MODES.has(requestedRaw as AgentModeContract)) {
    return {
      answer: `不支援模式 "${requestedRaw}"。可用模式：${AGENT_MODES.join(', ')}。`,
      nextMode: state.mode,
      ok: false,
    };
  }
  return {
    answer: `已切換為 ${requestedRaw} 模式。`,
    nextMode: requestedRaw as AgentModeContract,
    ok: true,
  };
}

function sendSseEvent(
  res: express.Response,
  eventName: string,
  payload: unknown
) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'express-genkit-ai-agent',
    endpoints: {
      health: 'GET /health',
      chatStream: 'POST /api/agent/chat/stream (SSE)',
      flow: 'POST /api/agent/flow (Genkit expressHandler format: { data: ... })',
    },
  });
});

app.post('/api/agent/flow', expressHandler(aiAgentFlow));

app.post('/api/agent/chat/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const body = ChatRequestSchema.parse(req.body);
    const state = getSessionState(body.sessionId, body.mode);
    sessions.set(body.sessionId, state);
    sendSseEvent(res, 'message_start', {
      sessionId: body.sessionId,
    });

    const command = body.command ?? parseSlashCommand(body.message);
    const isSlashMessage = body.message.trim().startsWith('/');

    if (!command && isSlashMessage) {
      sendSseEvent(res, 'done', {
        sessionId: body.sessionId,
        answer: `不支援此指令。可用指令：/mode ${AGENT_MODES.join(' | /mode ')}。`,
        mode: state.mode,
        historyCount: state.history.length,
        usedTools: [],
        actions: [],
        ui: [],
        sections: [],
      });
      res.end();
      return;
    }

    if (command) {
      if (command.name !== 'mode') {
        sendSseEvent(
          res,
          'done',
          buildCommandResponse({
            sessionId: body.sessionId,
            historyCount: state.history.length,
            mode: state.mode,
            command,
            answer: `目前僅支援 /mode。可用模式：${AGENT_MODES.join(', ')}。`,
            ok: false,
          })
        );
        res.end();
        return;
      }

      const result = handleModeCommand({ command, state });
      const nextState: SessionState = {
        ...state,
        mode: result.nextMode,
      };
      sessions.set(body.sessionId, nextState);

      sendSseEvent(
        res,
        'done',
        buildCommandResponse({
          sessionId: body.sessionId,
          historyCount: state.history.length,
          mode: nextState.mode,
          command,
          answer: result.answer,
          ok: result.ok,
        })
      );
      res.end();
      return;
    }

    const agentInput = toAgentInput(body, state);

    let finalResult: AgentOutput | undefined;

    for await (const event of streamAgent(agentInput)) {
      if (event.type === 'text_delta') {
        sendSseEvent(res, 'text_delta', { delta: event.delta });
        continue;
      }
      finalResult = event.output;
    }
    if (!finalResult) {
      throw new Error('Agent stream ended without final result');
    }

    const nextState = updateSessionStateWithHistory({
      sessionId: body.sessionId,
      prevState: state,
      userMessage: body.message,
      modelAnswer: finalResult.answer,
    });

    for (const uiBlock of finalResult.ui ?? []) {
      sendSseEvent(res, 'ui', { block: uiBlock });
    }

    for (const section of finalResult.sections ?? []) {
      sendSseEvent(res, 'section', { section });
    }

    sendSseEvent(res, 'actions', {
      actions: finalResult.actions ?? [],
      navigateTo: finalResult.navigateTo,
      openModalId: finalResult.openModalId,
    });

    sendSseEvent(res, 'done', {
      sessionId: body.sessionId,
      ...finalResult,
      mode: state.mode,
      historyCount: nextState.history.length,
    });
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendSseEvent(res, 'error', {
      error: message,
    });
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`AI agent server listening on http://localhost:${PORT}`);
});
