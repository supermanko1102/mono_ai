import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from './agent-schema.js';

type FinanceKind = 'asset' | 'liability';

type CreateFinanceItemResult = {
  id: number;
  kind: FinanceKind;
  category: string;
  amount: number;
  createdAt: string;
};

type FinanceSummaryPayload = {
  totals?: {
    assets?: number;
    liabilities?: number;
    netWorth?: number;
  };
  assets?: Array<{
    label?: string;
    amount?: number;
  }>;
  liabilities?: Array<{
    label?: string;
    amount?: number;
  }>;
};

type FinanceItemsPayload = {
  items?: Array<{
    kind?: FinanceKind;
    amount?: number;
    createdAt?: string;
  }>;
};

type FinanceTrendPoint = {
  label: string;
  assets: number;
  liabilities: number;
};

export type FinanceOverviewResult = {
  summary: {
    totals: {
      assets: number;
      liabilities: number;
      netWorth: number;
    };
    assets: Array<{
      label: string;
      amount: number;
    }>;
    liabilities: Array<{
      label: string;
      amount: number;
    }>;
  };
  trend: FinanceTrendPoint[];
  baseUrl: string;
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

function parseUtcDate(input: string): Date | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.includes('T')
    ? trimmed
    : trimmed.replace(' ', 'T');
  const withTimezone = /Z|[+-]\d{2}:\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const parsed = new Date(withTimezone);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function toDayKeyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildTrendPoints(
  items: Array<{
    kind: FinanceKind;
    amount: number;
    createdAt: string;
  }>,
  rangeDays: number
): FinanceTrendPoint[] {
  const today = new Date();
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  start.setUTCDate(start.getUTCDate() - (rangeDays - 1));
  const startKey = toDayKeyUtc(start);

  const dailyDelta = new Map<string, { assets: number; liabilities: number }>();
  let seedAssets = 0;
  let seedLiabilities = 0;

  for (const item of items) {
    const parsedDate = parseUtcDate(item.createdAt);
    if (!parsedDate) {
      continue;
    }

    const key = toDayKeyUtc(parsedDate);
    const amount = Number.isFinite(item.amount) ? item.amount : 0;
    if (key < startKey) {
      if (item.kind === 'asset') {
        seedAssets += amount;
      } else {
        seedLiabilities += amount;
      }
      continue;
    }

    const row = dailyDelta.get(key) ?? { assets: 0, liabilities: 0 };
    if (item.kind === 'asset') {
      row.assets += amount;
    } else {
      row.liabilities += amount;
    }
    dailyDelta.set(key, row);
  }

  let runningAssets = seedAssets;
  let runningLiabilities = seedLiabilities;
  const points: FinanceTrendPoint[] = [];

  for (let i = 0; i < rangeDays; i += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    const key = toDayKeyUtc(day);
    const delta = dailyDelta.get(key);
    if (delta) {
      runningAssets += delta.assets;
      runningLiabilities += delta.liabilities;
    }

    points.push({
      label: key.slice(5),
      assets: Math.round(runningAssets * 100) / 100,
      liabilities: Math.round(runningLiabilities * 100) / 100,
    });
  }

  return points;
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

export async function getFinanceOverviewImpl({
  rangeDays = 7,
}: {
  rangeDays?: number;
}): Promise<FinanceOverviewResult> {
  const baseUrl = resolveWebsiteDataBaseUrl();
  const days = Number.isFinite(rangeDays)
    ? Math.max(3, Math.min(30, Math.trunc(rangeDays)))
    : 7;

  const [summaryResp, itemsResp] = await Promise.all([
    fetch(`${baseUrl}/api/data/summary`, {
      cache: 'no-store',
    }),
    fetch(`${baseUrl}/api/data/items?limit=500`, {
      cache: 'no-store',
    }),
  ]);

  if (!summaryResp.ok) {
    throw new Error(`website summary API failed (${summaryResp.status})`);
  }
  if (!itemsResp.ok) {
    throw new Error(`website items API failed (${itemsResp.status})`);
  }

  const rawSummary = (await summaryResp.json()) as FinanceSummaryPayload;
  const rawItems = (await itemsResp.json()) as FinanceItemsPayload;

  const assets =
    rawSummary.assets
      ?.map((item) => ({
        label: typeof item.label === 'string' ? item.label.trim() : '',
        amount:
          typeof item.amount === 'number' && Number.isFinite(item.amount)
            ? item.amount
            : Number.NaN,
      }))
      .filter(
        (
          item
        ): item is {
          label: string;
          amount: number;
        } => !!item.label && Number.isFinite(item.amount) && item.amount >= 0
      ) ?? [];

  const liabilities =
    rawSummary.liabilities
      ?.map((item) => ({
        label: typeof item.label === 'string' ? item.label.trim() : '',
        amount:
          typeof item.amount === 'number' && Number.isFinite(item.amount)
            ? item.amount
            : Number.NaN,
      }))
      .filter(
        (
          item
        ): item is {
          label: string;
          amount: number;
        } => !!item.label && Number.isFinite(item.amount) && item.amount >= 0
      ) ?? [];

  const totals = {
    assets:
      typeof rawSummary.totals?.assets === 'number' &&
      Number.isFinite(rawSummary.totals.assets)
        ? rawSummary.totals.assets
        : assets.reduce((sum, item) => sum + item.amount, 0),
    liabilities:
      typeof rawSummary.totals?.liabilities === 'number' &&
      Number.isFinite(rawSummary.totals.liabilities)
        ? rawSummary.totals.liabilities
        : liabilities.reduce((sum, item) => sum + item.amount, 0),
    netWorth:
      typeof rawSummary.totals?.netWorth === 'number' &&
      Number.isFinite(rawSummary.totals.netWorth)
        ? rawSummary.totals.netWorth
        : 0,
  };
  if (!Number.isFinite(totals.netWorth)) {
    totals.netWorth = totals.assets - totals.liabilities;
  }

  const items =
    rawItems.items
      ?.map((item) => ({
        kind: item.kind === 'asset' || item.kind === 'liability' ? item.kind : null,
        amount:
          typeof item.amount === 'number' && Number.isFinite(item.amount)
            ? item.amount
            : Number.NaN,
        createdAt:
          typeof item.createdAt === 'string' ? item.createdAt.trim() : '',
      }))
      .filter(
        (
          item
        ): item is {
          kind: FinanceKind;
          amount: number;
          createdAt: string;
        } =>
          !!item.kind &&
          Number.isFinite(item.amount) &&
          item.amount >= 0 &&
          !!item.createdAt
      ) ?? [];

  const trend = buildTrendPoints(items, days);

  return {
    summary: {
      totals: {
        assets: Math.round(totals.assets * 100) / 100,
        liabilities: Math.round(totals.liabilities * 100) / 100,
        netWorth: Math.round((totals.assets - totals.liabilities) * 100) / 100,
      },
      assets,
      liabilities,
    },
    trend,
    baseUrl,
  };
}
