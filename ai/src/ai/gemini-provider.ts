import { z } from 'genkit';

import { ai } from './genkit.js';
import { createSystemPrompt, finalizeAgentOutput } from './action-utils.js';
import {
  type AgentInput,
  type AgentOutput,
  AgentOutputSchema,
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
} from './agent-schema.js';
import {
  calculateImpl,
  createFinanceItemImpl,
  getFinanceOverviewImpl,
  getDateTimeImpl,
  lookupFaqImpl,
} from './tool-impl.js';

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
      timezone: z.string().default(DEFAULT_TIMEZONE),
      locale: z.string().default(DEFAULT_LOCALE),
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

const getFinanceOverview = ai.defineTool(
  {
    name: 'getFinanceOverview',
    description:
      'Get finance summary and recent asset/liability trend points. Use for chart, distribution, trend, breakdown questions.',
    inputSchema: z.object({
      rangeDays: z.number().min(3).max(30).default(7),
    }),
    outputSchema: z.object({
      summary: z.object({
        totals: z.object({
          assets: z.number(),
          liabilities: z.number(),
          netWorth: z.number(),
        }),
        assets: z.array(
          z.object({
            label: z.string(),
            amount: z.number(),
          })
        ),
        liabilities: z.array(
          z.object({
            label: z.string(),
            amount: z.number(),
          })
        ),
      }),
      trend: z.array(
        z.object({
          label: z.string(),
          assets: z.number(),
          liabilities: z.number(),
        })
      ),
      baseUrl: z.string(),
    }),
  },
  async ({ rangeDays }) => getFinanceOverviewImpl({ rangeDays })
);

const createFinanceItem = ai.defineTool(
  {
    name: 'createFinanceItem',
    description:
      'Create a finance item in the website data store. Use when user asks to add asset/liability data.',
    inputSchema: z.object({
      kind: z.enum(['asset', 'liability']),
      category: z.string(),
      amount: z.number(),
    }),
    outputSchema: z.object({
      item: z.object({
        id: z.number(),
        kind: z.enum(['asset', 'liability']),
        category: z.string(),
        amount: z.number(),
        createdAt: z.string(),
      }),
      baseUrl: z.string(),
    }),
  },
  async ({ kind, category, amount }) =>
    createFinanceItemImpl({ kind, category, amount })
);

export async function runGeminiAgent(input: AgentInput): Promise<AgentOutput> {
  ensureGeminiApiKey();
  const systemPrompt = createSystemPrompt(
    input.availableRoutes,
    input.availableModals
  );

  const { output, text } = await ai.generate({
    system: systemPrompt,
    messages: input.history.map((message) => ({
      role: message.role,
      content: [{ text: message.content }],
    })),
    prompt: input.message,
    tools: [getDateTime, calculate, createFinanceItem, getFinanceOverview, lookupFaq],
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
      availableModals: input.availableModals,
      actions: output.actions,
      ui: output.ui,
      sections: output.sections,
      navigateTo: output.navigateTo,
      openModalId: output.openModalId,
    });
  }

  return finalizeAgentOutput({
    answer: text ?? '目前沒有可用回覆，請再試一次。',
    usedTools: [],
    availableRoutes: input.availableRoutes,
    availableModals: input.availableModals,
  });
}
