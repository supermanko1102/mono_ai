import { ai } from './genkit.js';
import {
  AgentHistoryMessageSchema,
  AgentInputSchema,
  AgentOutputSchema,
  type AgentInput,
  type AgentOutput,
} from './agent-schema.js';
import { runGeminiAgent } from './gemini-provider.js';
import { runOpenAIAgent } from './openai-provider.js';

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

export const aiAgentFlow = ai.defineFlow(
  {
    name: 'aiAgentFlow',
    inputSchema: AgentInputSchema,
    outputSchema: AgentOutputSchema,
  },
  async (input) => runAgent(input)
);
