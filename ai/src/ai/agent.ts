import { ai } from './genkit.js';
import {
  AgentHistoryMessageSchema,
  AgentInputSchema,
  AgentOutputSchema,
  type AgentInput,
  type AgentOutput,
} from './agent-schema.js';
import { runGeminiAgent } from './gemini-provider.js';
import {
  runOpenAIAgent,
  streamOpenAIAgent,
  type OpenAIAgentStreamEvent,
} from './openai-provider.js';

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

export {
  AgentHistoryMessageSchema,
  AgentInputSchema,
  AgentOutputSchema,
  type AgentInput,
  type AgentOutput,
};

export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const provider = getConfiguredProvider();

  if (provider === 'openai') {
    return runOpenAIAgent(input);
  }

  return runGeminiAgent(input);
}

export type AgentStreamEvent =
  | OpenAIAgentStreamEvent
  | {
      type: 'text_delta';
      delta: string;
    }
  | {
      type: 'final';
      output: AgentOutput;
    };

function splitFallbackText(answer: string): string[] {
  const trimmed = answer.trim();
  if (!trimmed) {
    return ['目前沒有可用回覆，請再試一次。'];
  }
  const chunkSize = 12;
  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += chunkSize) {
    chunks.push(trimmed.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function* streamAgent(
  input: AgentInput
): AsyncGenerator<AgentStreamEvent> {
  const provider = getConfiguredProvider();
  if (provider === 'openai') {
    for await (const event of streamOpenAIAgent(input)) {
      yield event;
    }
    return;
  }

  const result = await runGeminiAgent(input);
  for (const chunk of splitFallbackText(result.answer)) {
    yield {
      type: 'text_delta',
      delta: chunk,
    };
  }
  yield {
    type: 'final',
    output: result,
  };
}

export const aiAgentFlow = ai.defineFlow(
  {
    name: 'aiAgentFlow',
    inputSchema: AgentInputSchema,
    outputSchema: AgentOutputSchema,
  },
  async (input) => runAgent(input)
);
