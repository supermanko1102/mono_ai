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
  navigateTo: z.string().optional(),
  openModalId: z.string().optional(),
});

export type AgentInput = z.infer<typeof AgentInputSchema>;
export type AgentOutput = z.infer<typeof AgentOutputSchema>;
export type AgentAction = AgentOutput['actions'][number];

type _AgentInputCompat = AgentInput extends AgentInputContract ? true : never;
type _AgentOutputCompat = AgentOutput extends AgentOutputContract ? true : never;
type _AgentActionCompat = AgentAction extends AgentActionContract ? true : never;
type _AgentHistoryCompat = z.infer<typeof AgentHistoryMessageSchema> extends AgentHistoryMessageContract
  ? true
  : never;
