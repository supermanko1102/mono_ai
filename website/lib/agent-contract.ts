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

export type AgentChatResponse = {
  sessionId: string;
  answer: string;
  usedTools?: string[];
  actions?: AgentAction[];
  ui?: AgentUiBlock[];
  navigateTo?: string;
  openModalId?: string;
  historyCount?: number;
  error?: string;
};

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isAgentUiBlock(value: unknown): value is AgentUiBlock {
  if (!value || typeof value !== "object") {
    return false;
  }

  const block = value as Record<string, unknown>;
  if (block.type === "asset_donut") {
    if (!Array.isArray(block.items) || block.items.length === 0) {
      return false;
    }
    return block.items.every((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const row = item as Record<string, unknown>;
      return (
        typeof row.label === "string" &&
        row.label.trim().length > 0 &&
        isFiniteNonNegativeNumber(row.amount)
      );
    });
  }

  if (block.type === "finance_trend_line") {
    if (!Array.isArray(block.points) || block.points.length < 2) {
      return false;
    }
    return block.points.every((point) => {
      if (!point || typeof point !== "object") {
        return false;
      }
      const row = point as Record<string, unknown>;
      return (
        typeof row.label === "string" &&
        row.label.trim().length > 0 &&
        isFiniteNonNegativeNumber(row.assets) &&
        isFiniteNonNegativeNumber(row.liabilities)
      );
    });
  }

  return false;
}
