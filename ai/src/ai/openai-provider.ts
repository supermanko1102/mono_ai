import OpenAI from 'openai';

import { createSystemPrompt, finalizeAgentOutput } from './action-utils.js';
import {
  type AgentInput,
  type AgentOutput,
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
} from './agent-schema.js';
import {
  calculateImpl,
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
        availableModals: input.availableModals,
      });
    }
    break;
  }

  return finalizeAgentOutput({
    answer: '目前沒有可用回覆，請再試一次。',
    usedTools: Array.from(usedTools),
    availableRoutes: input.availableRoutes,
    availableModals: input.availableModals,
  });
}
