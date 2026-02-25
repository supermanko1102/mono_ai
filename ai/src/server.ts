import 'dotenv/config';

import { expressHandler } from '@genkit-ai/express';
import express from 'express';
import { z } from 'genkit';

import {
  AgentHistoryMessageSchema,
  AgentInputSchema,
  aiAgentFlow,
  runAgent,
} from './ai/agent.js';

const ChatRequestSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
  timezone: z.string().optional(),
  locale: z.string().optional(),
});

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3000);

const sessions = new Map<
  string,
  Array<z.infer<typeof AgentHistoryMessageSchema>>
>();

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'express-genkit-ai-agent',
    endpoints: {
      health: 'GET /health',
      chat: 'POST /api/agent/chat',
      flow: 'POST /api/agent/flow (Genkit expressHandler format: { data: ... })',
    },
  });
});

app.post('/api/agent/flow', expressHandler(aiAgentFlow));

app.post('/api/agent/chat', async (req, res) => {
  try {
    const body = ChatRequestSchema.parse(req.body);
    const prev = sessions.get(body.sessionId) ?? [];

    const agentInput = AgentInputSchema.parse({
      message: body.message,
      history: prev,
      timezone: body.timezone,
      locale: body.locale,
    });

    const result = await runAgent(agentInput);

    const nextHistory = [
      ...prev,
      { role: 'user', content: body.message } as const,
      { role: 'model', content: result.answer } as const,
    ].slice(-20);

    sessions.set(body.sessionId, nextHistory);

    res.json({
      sessionId: body.sessionId,
      ...result,
      historyCount: nextHistory.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isServerMisconfig = message.includes('Missing API key');
    res.status(isServerMisconfig ? 500 : 400).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`AI agent server listening on http://localhost:${PORT}`);
});
