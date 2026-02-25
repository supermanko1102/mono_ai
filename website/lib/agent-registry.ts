export const AGENT_ROUTES = ["/", "/pricing", "/docs", "/support"] as const;
export const AGENT_MODAL_IDS = [
  "pricing-comparison",
  "docs-quickstart",
  "support-contact",
] as const;

export type AgentModal = {
  id: (typeof AGENT_MODAL_IDS)[number];
  title: string;
  body: string;
};

const MODAL_MAP: Record<string, AgentModal> = {
  "pricing-comparison": {
    id: "pricing-comparison",
    title: "Pricing Comparison",
    body: "這裡可以展示 Free / Pro / Enterprise 的差異，例如功能、流量與 SLA。",
  },
  "docs-quickstart": {
    id: "docs-quickstart",
    title: "Docs Quickstart",
    body: "這裡可以放 3 分鐘快速上手步驟，例如安裝 SDK、設定環境變數與第一次呼叫。",
  },
  "support-contact": {
    id: "support-contact",
    title: "Support Contact",
    body: "這裡可以放客服聯絡入口，像是 Email、工單連結與服務時間。",
  },
};

const ROUTE_SET = new Set(AGENT_ROUTES);

export function normalizePath(path: string): (typeof AGENT_ROUTES)[number] {
  const normalized =
    path !== "/" ? path.replace(/\/+$/, "") || "/" : path || "/";
  if (ROUTE_SET.has(normalized as (typeof AGENT_ROUTES)[number])) {
    return normalized as (typeof AGENT_ROUTES)[number];
  }
  return "/";
}

export function normalizeModalId(modalId: string): string | null {
  const trimmed = modalId.trim();
  return MODAL_MAP[trimmed] ? trimmed : null;
}

export function getModalById(modalId: string | null): AgentModal | null {
  if (!modalId) {
    return null;
  }
  return MODAL_MAP[modalId] ?? null;
}

export function getModalTitle(modalId: string): string {
  return MODAL_MAP[modalId]?.title ?? modalId;
}
