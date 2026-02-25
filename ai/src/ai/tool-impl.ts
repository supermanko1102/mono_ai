import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from './agent-schema.js';

type FinanceKind = 'asset' | 'liability';

type CreateFinanceItemResult = {
  id: number;
  kind: FinanceKind;
  category: string;
  amount: number;
  createdAt: string;
};

const DEFAULT_WEBSITE_DATA_BASE_URL = 'http://localhost:3000';

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

function parseFinanceKind(kind: string): FinanceKind | null {
  const normalized = kind.trim().toLowerCase();
  if (normalized === 'asset' || normalized === 'liability') {
    return normalized;
  }
  return null;
}

function resolveWebsiteDataBaseUrl(): string {
  return (
    process.env.WEBSITE_DATA_BASE_URL?.trim() ||
    process.env.WEBSITE_BASE_URL?.trim() ||
    DEFAULT_WEBSITE_DATA_BASE_URL
  );
}

export async function createFinanceItemImpl({
  kind,
  category,
  amount,
}: {
  kind: string;
  category: string;
  amount: number;
}): Promise<{
  item: CreateFinanceItemResult;
  baseUrl: string;
}> {
  const parsedKind = parseFinanceKind(kind);
  if (!parsedKind) {
    throw new Error('kind must be "asset" or "liability"');
  }

  const cleanedCategory = category.trim();
  if (!cleanedCategory) {
    throw new Error('category is required');
  }

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('amount must be a non-negative number');
  }

  const baseUrl = resolveWebsiteDataBaseUrl();
  const response = await fetch(`${baseUrl}/api/data/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      kind: parsedKind,
      category: cleanedCategory,
      amount: Math.round(amount * 100) / 100,
    }),
    cache: 'no-store',
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : `website data API failed (${response.status})`;
    throw new Error(errorMessage);
  }

  const item =
    payload &&
    typeof payload === 'object' &&
    'item' in payload &&
    payload.item &&
    typeof payload.item === 'object'
      ? (payload.item as CreateFinanceItemResult)
      : null;

  if (!item) {
    throw new Error('website data API returned invalid payload');
  }

  return {
    item,
    baseUrl,
  };
}
