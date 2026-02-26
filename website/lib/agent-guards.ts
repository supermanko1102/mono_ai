import type { AgentSection, AgentUiBlock } from "@/lib/agent-contract";

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

export function isAgentSection(value: unknown): value is AgentSection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const section = value as Record<string, unknown>;
  if (typeof section.id !== "string" || section.id.trim().length === 0) {
    return false;
  }
  if (section.slot !== "after-b") {
    return false;
  }
  if (section.mode !== undefined && section.mode !== "ephemeral") {
    return false;
  }
  if (!Array.isArray(section.blocks) || section.blocks.length === 0) {
    return false;
  }

  return section.blocks.every((block) => isAgentUiBlock(block));
}
