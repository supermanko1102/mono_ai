import OpenAI from 'openai';
import { ai } from './genkit.js';
import { z } from 'genkit';

const DEFAULT_TIMEZONE = 'Asia/Taipei';
const DEFAULT_LOCALE = 'zh-TW';
const DEFAULT_AVAILABLE_ROUTES = ['/', '/pricing', '/docs', '/support'];

export const AgentHistoryMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string().min(1),
});

export const AgentInputSchema = z.object({
  message: z.string().min(1),
  history: z.array(AgentHistoryMessageSchema).default([]),
  timezone: z.string().default(DEFAULT_TIMEZONE),
  locale: z.string().default(DEFAULT_LOCALE),
  availableRoutes: z.array(z.string()).default(DEFAULT_AVAILABLE_ROUTES),
});

export const AgentOutputSchema = z.object({
  answer: z.string(),
  usedTools: z.array(z.string()).default([]),
  navigateTo: z.string().optional(),
});

export type AgentInput = z.infer<typeof AgentInputSchema>;
export type AgentOutput = z.infer<typeof AgentOutputSchema>;

function normalizeRoute(route: string): string | undefined {
  const trimmed = route.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return undefined;
  }
  if (!/^\/[A-Za-z0-9/_-]*$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function normalizeAvailableRoutes(routes: string[]): string[] {
  const normalized = Array.from(
    new Set(routes.map((route) => normalizeRoute(route)).filter(Boolean))
  ) as string[];
  if (normalized.length > 0) {
    return normalized;
  }
  return DEFAULT_AVAILABLE_ROUTES;
}

function parseNavigationTag(text: string): {
  answer: string;
  navigateTo?: string;
} {
  const pattern = /<<NAVIGATE:([^>\n]+)>>/i;
  const match = text.match(pattern);
  if (!match) {
    return { answer: text.trim() };
  }

  const candidate = normalizeRoute(match[1] ?? '');
  const answer = text.replace(pattern, '').trim();
  return {
    answer,
    ...(candidate ? { navigateTo: candidate } : {}),
  };
}

function finalizeAgentOutput({
  answer,
  usedTools,
  availableRoutes,
  navigateTo,
}: {
  answer: string;
  usedTools: string[];
  availableRoutes: string[];
  navigateTo?: string;
}): AgentOutput {
  const allowedRoutes = normalizeAvailableRoutes(availableRoutes);
  const parsed = parseNavigationTag(answer);
  const directRoute = navigateTo ? normalizeRoute(navigateTo) : undefined;
  const routeCandidate = directRoute ?? parsed.navigateTo;
  const canNavigate =
    routeCandidate && allowedRoutes.some((route) => route === routeCandidate);

  return {
    answer: parsed.answer || '目前沒有可用回覆，請再試一次。',
    usedTools: Array.from(new Set(usedTools)),
    ...(canNavigate ? { navigateTo: routeCandidate } : {}),
  };
}

function createSystemPrompt(availableRoutes: string[]): string {
  const routes = normalizeAvailableRoutes(availableRoutes).join(', ');
  return [
    'You are a practical AI agent for developers.',
    'Answer in Traditional Chinese unless user asks otherwise.',
    'Use tools when they improve accuracy.',
    `Allowed website routes: ${routes}.`,
    'When user clearly asks to go/open/navigate to a page, append one tag exactly like <<NAVIGATE:/route>> at the end of your answer.',
    'Only use allowed routes.',
  ].join(' ');
}

function getConfiguredProvider(): 'openai' | 'gemini' {
  if (process.env.OPENAI_API_KEY) {
    return 'openai';
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY) {
    return 'gemini';
  }
  throw new Error(
    'Missing API key. Please set OPENAI_API_KEY or GEMINI_API_KEY / GOOGLE_GENAI_API_KEY in .env'
  );
}

function getDateTimeImpl({
  timezone = DEFAULT_TIMEZONE,
  locale = DEFAULT_LOCALE,
}: {
  timezone?: string;
  locale?: string;
}) {
  const now = new Date();
  const local = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(now);

  return {
    iso: now.toISOString(),
    local,
    timezone,
  };
}

function calculateImpl({ expression }: { expression: string }) {
  const safePattern = /^[0-9+\-*/%().\s]+$/;
  if (!safePattern.test(expression)) {
    throw new Error('Expression contains invalid characters.');
  }

  const result = Function(`"use strict"; return (${expression});`)();
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('Expression did not produce a valid number.');
  }

  return {
    expression,
    result,
  };
}

function lookupFaqImpl({ topic }: { topic: string }) {
  const faq: Record<string, { answer: string; source: string }> = {
    'tech stack': {
      answer: 'Backend uses Node.js + Express, AI orchestration with Genkit.',
      source: 'local-faq',
    },
    deploy: {
      answer: 'You can containerize and deploy to Cloud Run, Render, Fly.io, or Railway.',
      source: 'local-faq',
    },
    auth: {
      answer: 'Start with API key auth at edge and move to OAuth/JWT for user-level access.',
      source: 'local-faq',
    },
  };

  const key = topic.trim().toLowerCase();
  const hit = faq[key];

  if (!hit) {
    return {
      topic,
      answer: 'No exact FAQ hit. Ask more specific keywords.',
      source: 'local-faq',
    };
  }

  return {
    topic,
    answer: hit.answer,
    source: hit.source,
  };
}

const openAITools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'getDateTime',
      description:
        'Get current date and time for a specific timezone. Use when user asks about time/date/deadline.',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string' },
          locale: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description:
        'Calculate a math expression. Supports numbers, (), + - * / % and spaces.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string' },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookupFaq',
      description:
        'Lookup known project FAQ entries for setup or architecture questions.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
        },
        required: ['topic'],
      },
    },
  },
];

function parseToolArguments(
  rawArgs: string | undefined
): Record<string, unknown> {
  if (!rawArgs) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawArgs);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

async function executeOpenAITool(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall
) {
  const args = parseToolArguments(toolCall.function.arguments);

  try {
    switch (toolCall.function.name) {
      case 'getDateTime':
        return getDateTimeImpl({
          timezone:
            typeof args.timezone === 'string' ? args.timezone : DEFAULT_TIMEZONE,
          locale: typeof args.locale === 'string' ? args.locale : DEFAULT_LOCALE,
        });
      case 'calculate':
        return calculateImpl({
          expression: typeof args.expression === 'string' ? args.expression : '',
        });
      case 'lookupFaq':
        return lookupFaqImpl({
          topic: typeof args.topic === 'string' ? args.topic : '',
        });
      default:
        return { error: `Unknown tool: ${toolCall.function.name}` };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Tool execution failed',
    };
  }
}

function toOpenAIHistoryMessage(
  message: z.infer<typeof AgentHistoryMessageSchema>
): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  return {
    role: message.role === 'model' ? 'assistant' : 'user',
    content: message.content,
  };
}

async function runOpenAIAgent(input: AgentInput): Promise<AgentOutput> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing API key. Please set OPENAI_API_KEY in .env');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  const systemPrompt = createSystemPrompt(input.availableRoutes);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    ...input.history.map(toOpenAIHistoryMessage),
    {
      role: 'user',
      content: input.message,
    },
  ];

  const usedTools = new Set<string>();

  for (let i = 0; i < 5; i += 1) {
    const completion = await client.chat.completions.create({
      model,
      messages,
      tools: openAITools,
      tool_choice: 'auto',
    });

    const message = completion.choices[0]?.message;
    if (!message) {
      break;
    }

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        if (toolCall.type !== 'function') {
          continue;
        }
        usedTools.add(toolCall.function.name);
        const toolResult = await executeOpenAITool(toolCall);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }
      continue;
    }

    const answer = typeof message.content === 'string' ? message.content : '';
    if (answer.trim()) {
      return finalizeAgentOutput({
        answer,
        usedTools: Array.from(usedTools),
        availableRoutes: input.availableRoutes,
      });
    }
    break;
  }

  return finalizeAgentOutput({
    answer: '目前沒有可用回覆，請再試一次。',
    usedTools: Array.from(usedTools),
    availableRoutes: input.availableRoutes,
  });
}

function ensureGeminiApiKey() {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY) {
    return;
  }
  throw new Error(
    'Missing API key. Please set GEMINI_API_KEY or GOOGLE_GENAI_API_KEY in .env'
  );
}

const getDateTime = ai.defineTool(
  {
    name: 'getDateTime',
    description:
      'Get current date and time for a specific timezone. Use when user asks about time/date/deadline.',
    inputSchema: z.object({
      timezone: z.string().default('Asia/Taipei'),
      locale: z.string().default('zh-TW'),
    }),
    outputSchema: z.object({
      iso: z.string(),
      local: z.string(),
      timezone: z.string(),
    }),
  },
  async ({ timezone, locale }) => getDateTimeImpl({ timezone, locale })
);

const calculate = ai.defineTool(
  {
    name: 'calculate',
    description:
      'Calculate a math expression. Supports numbers, (), + - * / % and spaces.',
    inputSchema: z.object({
      expression: z.string(),
    }),
    outputSchema: z.object({
      expression: z.string(),
      result: z.number(),
    }),
  },
  async ({ expression }) => calculateImpl({ expression })
);

const lookupFaq = ai.defineTool(
  {
    name: 'lookupFaq',
    description:
      'Lookup known project FAQ entries for setup or architecture questions.',
    inputSchema: z.object({
      topic: z.string(),
    }),
    outputSchema: z.object({
      topic: z.string(),
      answer: z.string(),
      source: z.string(),
    }),
  },
  async ({ topic }) => lookupFaqImpl({ topic })
);

async function runGeminiAgent(input: AgentInput): Promise<AgentOutput> {
  ensureGeminiApiKey();
  const systemPrompt = createSystemPrompt(input.availableRoutes);

  const { output, text } = await ai.generate({
    system: systemPrompt,
    messages: input.history.map((m) => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
    prompt: input.message,
    tools: [getDateTime, calculate, lookupFaq],
    maxTurns: 5,
    output: {
      schema: AgentOutputSchema,
    },
  });

  if (output) {
    return finalizeAgentOutput({
      answer: output.answer,
      usedTools: output.usedTools,
      availableRoutes: input.availableRoutes,
      navigateTo: output.navigateTo,
    });
  }

  return finalizeAgentOutput({
    answer: text ?? '目前沒有可用回覆，請再試一次。',
    usedTools: [],
    availableRoutes: input.availableRoutes,
  });
}

export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const provider = getConfiguredProvider();

  if (provider === 'openai') {
    return runOpenAIAgent(input);
  }

  return runGeminiAgent(input);
}

export const aiAgentFlow = ai.defineFlow(
  {
    name: 'aiAgentFlow',
    inputSchema: AgentInputSchema,
    outputSchema: AgentOutputSchema,
  },
  async (input) => runAgent(input)
);
