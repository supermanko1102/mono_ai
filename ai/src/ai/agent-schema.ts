import { z } from 'genkit';
import type {
  AgentActionContract,
  AgentHistoryMessageContract,
  AgentInputContract,
  AgentOutputContract,
} from '../shared/agent-contract.js';

import {
  DEFAULT_AVAILABLE_MODALS,
  DEFAULT_AVAILABLE_ROUTES,
} from '../shared/agent-contract.js';

export const DEFAULT_TIMEZONE = 'Asia/Taipei';
export const DEFAULT_LOCALE = 'zh-TW';

const AgentActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('navigate'),
    to: z.string(),
  }),
  z.object({
    type: z.literal('open_modal'),
    id: z.string(),
  }),
]);

const AgentUiSliceSchema = z.object({
  label: z.string().min(1),
  amount: z.number().nonnegative(),
});

const AgentUiTrendPointSchema = z.object({
  label: z.string().min(1),
  assets: z.number().nonnegative(),
  liabilities: z.number().nonnegative(),
});

const AgentUiBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('asset_donut'),
    title: z.string().optional(),
    items: z.array(AgentUiSliceSchema).min(1).max(12),
  }),
  z.object({
    type: z.literal('finance_trend_line'),
    title: z.string().optional(),
    points: z.array(AgentUiTrendPointSchema).min(2).max(60),
  }),
]);

const AgentSectionSchema = z.object({
  id: z.string().min(1),
  slot: z.literal('after-b'),
  mode: z.enum(['ephemeral']).default('ephemeral'),
  title: z.string().optional(),
  blocks: z.array(AgentUiBlockSchema).min(1).max(6),
});

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
  availableModals: z.array(z.string()).default(DEFAULT_AVAILABLE_MODALS),
});

export const AgentOutputSchema = z.object({
  answer: z.string(),
  usedTools: z.array(z.string()).default([]),
  actions: z.array(AgentActionSchema).default([]),
  ui: z.array(AgentUiBlockSchema).default([]),
  sections: z.array(AgentSectionSchema).default([]),
  navigateTo: z.string().optional(),
  openModalId: z.string().optional(),
});

export type AgentInput = z.infer<typeof AgentInputSchema>;
export type AgentOutput = z.infer<typeof AgentOutputSchema>;
export type AgentAction = AgentOutput['actions'][number];
export type AgentUiBlock = AgentOutput['ui'][number];
export type AgentSection = AgentOutput['sections'][number];

type _AgentInputCompat = AgentInput extends AgentInputContract ? true : never;
type _AgentOutputCompat = AgentOutput extends AgentOutputContract ? true : never;
type _AgentActionCompat = AgentAction extends AgentActionContract ? true : never;
type _AgentHistoryCompat = z.infer<typeof AgentHistoryMessageSchema> extends AgentHistoryMessageContract
  ? true
  : never;
