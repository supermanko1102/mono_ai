import OpenAI from 'openai';

import { createSystemPrompt, finalizeAgentOutput } from './action-utils.js';
import {
  type AgentInput,
  type AgentOutput,
  type AgentUiBlock,
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
} from './agent-schema.js';
import {
  calculateImpl,
  createFinanceItemImpl,
  getFinanceOverviewImpl,
  type FinanceOverviewResult,
  getDateTimeImpl,
  lookupFaqImpl,
} from './tool-impl.js';

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
      name: 'createFinanceItem',
      description:
        'Create a finance item in the website data store. Use when user asks to add asset/liability data.',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['asset', 'liability'],
          },
          category: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['kind', 'category', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getFinanceOverview',
      description:
        'Get finance summary and recent asset/liability trend points. Use for chart, distribution, trend, breakdown questions.',
      parameters: {
        type: 'object',
        properties: {
          rangeDays: { type: 'number' },
        },
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
      case 'createFinanceItem':
        return createFinanceItemImpl({
          kind: typeof args.kind === 'string' ? args.kind : '',
          category: typeof args.category === 'string' ? args.category : '',
          amount:
            typeof args.amount === 'number'
              ? args.amount
              : Number.parseFloat(String(args.amount ?? '')),
        });
      case 'lookupFaq':
        return lookupFaqImpl({
          topic: typeof args.topic === 'string' ? args.topic : '',
        });
      case 'getFinanceOverview':
        return getFinanceOverviewImpl({
          rangeDays:
            typeof args.rangeDays === 'number'
              ? args.rangeDays
              : Number.parseFloat(String(args.rangeDays ?? '7')),
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

function hasAnyKeyword(text: string, keywords: readonly string[]): boolean {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function inferUiBlocksFromContext({
  message,
  answer,
  financeOverview,
}: {
  message: string;
  answer: string;
  financeOverview?: FinanceOverviewResult;
}): AgentUiBlock[] {
  if (!financeOverview) {
    return [];
  }

  const sourceText = `${message} ${answer}`;
  const wantsAssetDonut = hasAnyKeyword(sourceText, [
    '資產',
    '分佈',
    '分布',
    '配置',
    'allocation',
    'donut',
    'pie',
    'breakdown',
  ]);
  const wantsTrend = hasAnyKeyword(sourceText, [
    '趨勢',
    '變化',
    '走勢',
    'trend',
    'timeline',
    'line chart',
    '折線',
    '比較',
    'compare',
  ]);

  const ui: AgentUiBlock[] = [];

  if (wantsAssetDonut && financeOverview.summary.assets.length > 0) {
    ui.push({
      type: 'asset_donut',
      title: '目前資產配置',
      items: financeOverview.summary.assets.map((item) => ({
        label: item.label,
        amount: item.amount,
      })),
    });
  }

  if (wantsTrend && financeOverview.trend.length >= 2) {
    ui.push({
      type: 'finance_trend_line',
      title: `近 ${financeOverview.trend.length} 天資產與負債`,
      points: financeOverview.trend.map((point) => ({
        label: point.label,
        assets: point.assets,
        liabilities: point.liabilities,
      })),
    });
  }

  return ui;
}

function toOpenAIHistoryMessage(
  message: AgentInput['history'][number]
): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  return {
    role: message.role === 'model' ? 'assistant' : 'user',
    content: message.content,
  };
}

export async function runOpenAIAgent(input: AgentInput): Promise<AgentOutput> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing API key. Please set OPENAI_API_KEY in .env');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  const systemPrompt = createSystemPrompt(
    input.availableRoutes,
    input.availableModals
  );

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
  let lastFinanceOverview: FinanceOverviewResult | undefined;

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
        if (
          toolCall.function.name === 'getFinanceOverview' &&
          toolResult &&
          typeof toolResult === 'object' &&
          'summary' in toolResult &&
          'trend' in toolResult
        ) {
          lastFinanceOverview = toolResult as FinanceOverviewResult;
        }
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
        availableModals: input.availableModals,
        ui: inferUiBlocksFromContext({
          message: input.message,
          answer,
          financeOverview: lastFinanceOverview,
        }),
      });
    }
    break;
  }

  return finalizeAgentOutput({
    answer: '目前沒有可用回覆，請再試一次。',
    usedTools: Array.from(usedTools),
    availableRoutes: input.availableRoutes,
    availableModals: input.availableModals,
    ui: inferUiBlocksFromContext({
      message: input.message,
      answer: '',
      financeOverview: lastFinanceOverview,
    }),
  });
}

export type OpenAIAgentStreamEvent =
  | {
      type: 'text_delta';
      delta: string;
    }
  | {
      type: 'final';
      output: AgentOutput;
    };

type PendingToolCall = {
  id: string;
  name: string;
  arguments: string;
};

function toPendingToolCalls(
  toolCallMap: Map<number, PendingToolCall>
): OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall[] {
  return Array.from(toolCallMap.entries())
    .sort(([left], [right]) => left - right)
    .map(([index, call]) => ({
      id: call.id || `tool-call-${Date.now()}-${index}`,
      type: 'function' as const,
      function: {
        name: call.name,
        arguments: call.arguments || '{}',
      },
    }))
    .filter((call) => call.function.name.trim().length > 0);
}

export async function* streamOpenAIAgent(
  input: AgentInput
): AsyncGenerator<OpenAIAgentStreamEvent> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing API key. Please set OPENAI_API_KEY in .env');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  const systemPrompt = createSystemPrompt(
    input.availableRoutes,
    input.availableModals
  );

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
  let lastFinanceOverview: FinanceOverviewResult | undefined;

  for (let i = 0; i < 5; i += 1) {
    const stream = await client.chat.completions.create({
      model,
      messages,
      tools: openAITools,
      tool_choice: 'auto',
      stream: true,
    });

    let assistantContent = '';
    const pendingToolCalls = new Map<number, PendingToolCall>();
    let finishReason: string | null = null;
    let sawToolCallDelta = false;

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) {
        continue;
      }

      finishReason = choice.finish_reason ?? finishReason;
      const delta = choice.delta;
      if (!delta) {
        continue;
      }

      const contentDelta = typeof delta.content === 'string' ? delta.content : '';
      if (contentDelta) {
        assistantContent += contentDelta;
        if (!sawToolCallDelta) {
          yield {
            type: 'text_delta',
            delta: contentDelta,
          };
        }
      }

      const toolCallDeltas = delta.tool_calls ?? [];
      if (toolCallDeltas.length > 0) {
        sawToolCallDelta = true;
      }
      for (const toolCallDelta of toolCallDeltas) {
        const index = toolCallDelta.index ?? 0;
        const current = pendingToolCalls.get(index) ?? {
          id: '',
          name: '',
          arguments: '',
        };
        if (typeof toolCallDelta.id === 'string') {
          current.id = toolCallDelta.id;
        }
        if (toolCallDelta.function?.name) {
          current.name += toolCallDelta.function.name;
        }
        if (toolCallDelta.function?.arguments) {
          current.arguments += toolCallDelta.function.arguments;
        }
        pendingToolCalls.set(index, current);
      }
    }

    const toolCalls = toPendingToolCalls(pendingToolCalls);
    if (toolCalls.length > 0 || finishReason === 'tool_calls') {
      messages.push({
        role: 'assistant',
        content: assistantContent || '',
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        usedTools.add(toolCall.function.name);
        const toolResult = await executeOpenAITool(toolCall);
        if (
          toolCall.function.name === 'getFinanceOverview' &&
          toolResult &&
          typeof toolResult === 'object' &&
          'summary' in toolResult &&
          'trend' in toolResult
        ) {
          lastFinanceOverview = toolResult as FinanceOverviewResult;
        }
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }
      continue;
    }

    if (assistantContent.trim()) {
      const output = finalizeAgentOutput({
        answer: assistantContent,
        usedTools: Array.from(usedTools),
        availableRoutes: input.availableRoutes,
        availableModals: input.availableModals,
        ui: inferUiBlocksFromContext({
          message: input.message,
          answer: assistantContent,
          financeOverview: lastFinanceOverview,
        }),
      });
      yield {
        type: 'final',
        output,
      };
      return;
    }
    break;
  }

  const fallbackOutput = finalizeAgentOutput({
    answer: '目前沒有可用回覆，請再試一次。',
    usedTools: Array.from(usedTools),
    availableRoutes: input.availableRoutes,
    availableModals: input.availableModals,
    ui: inferUiBlocksFromContext({
      message: input.message,
      answer: '',
      financeOverview: lastFinanceOverview,
    }),
  });
  yield {
    type: 'final',
    output: fallbackOutput,
  };
}
