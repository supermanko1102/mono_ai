export const DEFAULT_AVAILABLE_ROUTES = ['/', '/pricing', '/docs', '/support'];
export const DEFAULT_AVAILABLE_MODALS = [
  'pricing-comparison',
  'docs-quickstart',
  'support-contact',
];

export type AgentHistoryRole = 'user' | 'model';

export type AgentHistoryMessageContract = {
  role: AgentHistoryRole;
  content: string;
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

export type AgentInputContract = {
  message: string;
  history?: AgentHistoryMessageContract[];
  timezone?: string;
  locale?: string;
  availableRoutes?: string[];
  availableModals?: string[];
};

export type AgentOutputContract = {
  answer: string;
  usedTools?: string[];
  actions?: AgentActionContract[];
  navigateTo?: string;
  openModalId?: string;
};

export type AgentChatRequestContract = AgentInputContract & {
  sessionId: string;
};

export type AgentChatResponseContract = AgentOutputContract & {
  sessionId: string;
  historyCount?: number;
  error?: string;
};
