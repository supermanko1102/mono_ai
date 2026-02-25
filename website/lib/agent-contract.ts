export type AgentAction =
  | {
      type: "navigate";
      to: string;
    }
  | {
      type: "open_modal";
      id: string;
    };

export type AgentChatResponse = {
  sessionId: string;
  answer: string;
  usedTools?: string[];
  actions?: AgentAction[];
  navigateTo?: string;
  openModalId?: string;
  historyCount?: number;
  error?: string;
};
