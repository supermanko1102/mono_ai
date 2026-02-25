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

const ChatRequestSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  availableRoutes: z.array(z.string()).optional(),
  availableModals: z.array(z.string()).optional(),
});

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3010);

const sessions = new Map<
  string,
  Array<z.infer<typeof AgentHistoryMessageSchema>>
>();

function toAgentInput(
  body: z.infer<typeof ChatRequestSchema>,
  history: Array<z.infer<typeof AgentHistoryMessageSchema>>
) {
  return AgentInputSchema.parse({
    message: body.message,
    history,
    timezone: body.timezone,
    locale: body.locale,
    availableRoutes: body.availableRoutes,
    availableModals: body.availableModals,
  });
}

function updateSessionHistory({
  sessionId,
  prev,
  userMessage,
  modelAnswer,
}: {
  sessionId: string;
  prev: Array<z.infer<typeof AgentHistoryMessageSchema>>;
  userMessage: string;
  modelAnswer: string;
}) {
  const nextHistory = [
    ...prev,
    { role: 'user', content: userMessage } as const,
    { role: 'model', content: modelAnswer } as const,
  ].slice(-20);
  sessions.set(sessionId, nextHistory);
  return nextHistory;
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
    const prev = sessions.get(body.sessionId) ?? [];
    const agentInput = toAgentInput(body, prev);
    sendSseEvent(res, 'message_start', {
      sessionId: body.sessionId,
    });

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

    const nextHistory = updateSessionHistory({
      sessionId: body.sessionId,
      prev,
      userMessage: body.message,
      modelAnswer: finalResult.answer,
    });

    for (const uiBlock of finalResult.ui ?? []) {
      sendSseEvent(res, 'ui', { block: uiBlock });
    }

    sendSseEvent(res, 'actions', {
      actions: finalResult.actions ?? [],
      navigateTo: finalResult.navigateTo,
      openModalId: finalResult.openModalId,
    });

    sendSseEvent(res, 'done', {
      sessionId: body.sessionId,
      ...finalResult,
      historyCount: nextHistory.length,
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
