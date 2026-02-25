import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from './agent-schema.js';

export function getDateTimeImpl({
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

export function calculateImpl({ expression }: { expression: string }) {
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

export function lookupFaqImpl({ topic }: { topic: string }) {
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
