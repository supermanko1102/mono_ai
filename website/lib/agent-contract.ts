export type AgentAction =
  | {
      type: "navigate";
      to: string;
    }
  | {
      type: "open_modal";
      id: string;
    };

export type AgentUiSlice = {
  label: string;
  amount: number;
};

export type AgentUiTrendPoint = {
  label: string;
  assets: number;
  liabilities: number;
};

export type AgentUiBlock =
  | {
      type: "asset_donut";
      title?: string;
      items: AgentUiSlice[];
    }
  | {
      type: "finance_trend_line";
      title?: string;
      points: AgentUiTrendPoint[];
    };

export type AgentSectionSlot = "after-b";

export type AgentSection = {
  id: string;
  slot: AgentSectionSlot;
  mode?: "ephemeral";
  title?: string;
  blocks: AgentUiBlock[];
};

export type AgentChatResponse = {
  sessionId: string;
  answer: string;
  usedTools?: string[];
  actions?: AgentAction[];
  ui?: AgentUiBlock[];
  sections?: AgentSection[];
  navigateTo?: string;
  openModalId?: string;
  historyCount?: number;
  error?: string;
};
