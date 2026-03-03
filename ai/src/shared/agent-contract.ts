export const DEFAULT_AVAILABLE_ROUTES = ['/', '/pricing', '/docs', '/support'];
export const DEFAULT_AVAILABLE_MODALS = [
  'pricing-comparison',
  'docs-quickstart',
  'support-contact',
];
export const AGENT_MODES = ['default', 'sales', 'tutor', 'support'] as const;
export const AGENT_COMMAND_NAMES = ['mode', 'summarize'] as const;

export type AgentHistoryRole = 'user' | 'model';
export type AgentModeContract = (typeof AGENT_MODES)[number];
export type AgentCommandNameContract = (typeof AGENT_COMMAND_NAMES)[number];

export type AgentHistoryMessageContract = {
  role: AgentHistoryRole;
  content: string;
};

export type AgentCommandContract = {
  name: AgentCommandNameContract;
  args?: string[];
};

export type AgentActionNavigateContract = {
  type: 'navigate';
  to: string;
};

export type AgentActionOpenModalContract = {
  type: 'open_modal';
  id: string;
};

export type AgentActionContract =
  | AgentActionNavigateContract
  | AgentActionOpenModalContract;

export type AgentUiSliceContract = {
  label: string;
  amount: number;
};

export type AgentUiTrendPointContract = {
  label: string;
  assets: number;
  liabilities: number;
};

export type AgentUiAssetDonutContract = {
  type: 'asset_donut';
  title?: string;
  items: AgentUiSliceContract[];
};

export type AgentUiFinanceTrendLineContract = {
  type: 'finance_trend_line';
  title?: string;
  points: AgentUiTrendPointContract[];
};

export type AgentUiBlockContract =
  | AgentUiAssetDonutContract
  | AgentUiFinanceTrendLineContract;

export type AgentSectionSlotContract = 'after-b';

export type AgentSectionContract = {
  id: string;
  slot: AgentSectionSlotContract;
  mode?: 'ephemeral';
  title?: string;
  blocks: AgentUiBlockContract[];
};

export type AgentInputContract = {
  message: string;
  history?: AgentHistoryMessageContract[];
  timezone?: string;
  locale?: string;
  availableRoutes?: string[];
  availableModals?: string[];
  mode?: AgentModeContract;
  command?: AgentCommandContract;
};

export type AgentOutputContract = {
  answer: string;
  usedTools?: string[];
  actions?: AgentActionContract[];
  ui?: AgentUiBlockContract[];
  sections?: AgentSectionContract[];
  navigateTo?: string;
  openModalId?: string;
  mode?: AgentModeContract;
  commandResult?: {
    name: AgentCommandNameContract;
    ok: boolean;
  };
  memoryHints?: string[];
};

export type AgentChatRequestContract = AgentInputContract & {
  sessionId: string;
};

export type AgentChatResponseContract = AgentOutputContract & {
  sessionId: string;
  historyCount?: number;
  error?: string;
};
