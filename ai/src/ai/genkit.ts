import { googleAI } from '@genkit-ai/google-genai';
import { genkit } from 'genkit';

const hasGeminiKey = Boolean(
  process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY
);

export const ai = genkit({
  plugins: hasGeminiKey ? [googleAI()] : [],
  ...(hasGeminiKey ? { model: googleAI.model('gemini-2.5-flash') } : {}),
});
