import {
  DEFAULT_AVAILABLE_MODALS,
  DEFAULT_AVAILABLE_ROUTES,
} from '../shared/agent-contract.js';
import type {
  AgentAction,
  AgentOutput,
  AgentSection,
  AgentUiBlock,
} from './agent-schema.js';

function normalizeRoute(route: string): string | undefined {
  const trimmed = route.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return undefined;
  }
  if (!/^\/[A-Za-z0-9/_-]*$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function normalizeModalId(modalId: string): string | undefined {
  const trimmed = modalId.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function normalizeUiLabel(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, 40);
}

function normalizeUiTitle(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, 80);
}

function normalizeSectionId(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  const normalized = trimmed
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, 48);
}

function normalizeAvailableRoutes(routes: string[]): string[] {
  const normalized = Array.from(
    new Set(routes.map((route) => normalizeRoute(route)).filter(Boolean))
  ) as string[];
  if (normalized.length > 0) {
    return normalized;
  }
  return DEFAULT_AVAILABLE_ROUTES;
}

function normalizeAvailableModals(modals: string[]): string[] {
  const normalized = Array.from(
    new Set(modals.map((modalId) => normalizeModalId(modalId)).filter(Boolean))
  ) as string[];
  if (normalized.length > 0) {
    return normalized;
  }
  return DEFAULT_AVAILABLE_MODALS;
}

function parseActionTags(text: string): {
  answer: string;
  routes: string[];
  modalIds: string[];
} {
  const navigatePattern = /<<NAVIGATE:([^>\n]+)>>/gi;
  const openModalPattern = /<<OPEN_MODAL:([^>\n]+)>>/gi;
  const routes: string[] = [];
  const modalIds: string[] = [];

  for (const match of text.matchAll(navigatePattern)) {
    const candidate = normalizeRoute(match[1] ?? '');
    if (candidate) {
      routes.push(candidate);
    }
  }

  for (const match of text.matchAll(openModalPattern)) {
    const candidate = normalizeModalId(match[1] ?? '');
    if (candidate) {
      modalIds.push(candidate);
    }
  }

  const answer = text
    .replace(navigatePattern, '')
    .replace(openModalPattern, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return {
    answer,
    routes,
    modalIds,
  };
}

function normalizeUiBlocks(uiBlocks: AgentUiBlock[] | undefined): AgentUiBlock[] {
  if (!uiBlocks || uiBlocks.length === 0) {
    return [];
  }

  return uiBlocks
    .map((block): AgentUiBlock | null => {
      if (block.type === 'asset_donut') {
        const normalizedItems = block.items
          .map((item) => ({
            label: normalizeUiLabel(item.label),
            amount: Number.isFinite(item.amount) ? item.amount : Number.NaN,
          }))
          .filter(
            (
              item
            ): item is {
              label: string;
              amount: number;
            } =>
              !!item.label &&
              Number.isFinite(item.amount) &&
              item.amount >= 0
          )
          .slice(0, 12);

        if (normalizedItems.length === 0) {
          return null;
        }

        return {
          type: 'asset_donut',
          title: normalizeUiTitle(block.title),
          items: normalizedItems,
        };
      }

      const normalizedPoints = block.points
        .map((point) => ({
          label: normalizeUiLabel(point.label),
          assets: Number.isFinite(point.assets) ? point.assets : Number.NaN,
          liabilities: Number.isFinite(point.liabilities)
            ? point.liabilities
            : Number.NaN,
        }))
        .filter(
          (
            point
          ): point is {
            label: string;
            assets: number;
            liabilities: number;
          } =>
            !!point.label &&
            Number.isFinite(point.assets) &&
            point.assets >= 0 &&
            Number.isFinite(point.liabilities) &&
            point.liabilities >= 0
        )
        .slice(0, 60);

      if (normalizedPoints.length < 2) {
        return null;
      }

      return {
        type: 'finance_trend_line',
        title: normalizeUiTitle(block.title),
        points: normalizedPoints,
      };
    })
    .filter((block): block is AgentUiBlock => block !== null);
}

function normalizeSections(sections: AgentSection[] | undefined): AgentSection[] {
  if (!sections || sections.length === 0) {
    return [];
  }

  return sections
    .map((section, index): AgentSection | null => {
      if (section.slot !== 'after-b') {
        return null;
      }
      const blocks = normalizeUiBlocks(section.blocks);
      if (blocks.length === 0) {
        return null;
      }
      return {
        id:
          normalizeSectionId(section.id) ??
          `section-c-${Date.now()}-${index + 1}`,
        slot: 'after-b',
        mode: 'ephemeral',
        title: normalizeUiTitle(section.title),
        blocks,
      };
    })
    .filter((section): section is AgentSection => section !== null)
    .slice(0, 3);
}

export function finalizeAgentOutput({
  answer,
  usedTools,
  availableRoutes,
  availableModals,
  actions,
  ui,
  sections,
  navigateTo,
  openModalId,
}: {
  answer: string;
  usedTools: string[];
  availableRoutes: string[];
  availableModals: string[];
  actions?: AgentAction[];
  ui?: AgentUiBlock[];
  sections?: AgentSection[];
  navigateTo?: string;
  openModalId?: string;
}): AgentOutput {
  const allowedRoutes = normalizeAvailableRoutes(availableRoutes);
  const allowedModals = normalizeAvailableModals(availableModals);
  const parsed = parseActionTags(answer);
  const directRoute = navigateTo ? normalizeRoute(navigateTo) : undefined;
  const directModalId = openModalId ? normalizeModalId(openModalId) : undefined;
  const actionRoutes =
    actions
      ?.filter((action) => action.type === 'navigate')
      .map((action) => normalizeRoute(action.to))
      .filter(Boolean) ?? [];
  const actionModalIds =
    actions
      ?.filter((action) => action.type === 'open_modal')
      .map((action) => normalizeModalId(action.id))
      .filter(Boolean) ?? [];
  const rawRoutes = [
    ...(directRoute ? [directRoute] : []),
    ...actionRoutes,
    ...parsed.routes,
  ];
  const rawModalIds = [
    ...(directModalId ? [directModalId] : []),
    ...actionModalIds,
    ...parsed.modalIds,
  ];
  const validRoutes = Array.from(
    new Set(
      rawRoutes.filter((route): route is string =>
        allowedRoutes.some((allowed) => allowed === route)
      )
    )
  );
  const validModalIds = Array.from(
    new Set(
      rawModalIds.filter((modalId): modalId is string =>
        allowedModals.some((allowed) => allowed === modalId)
      )
    )
  );

  const normalizedActions: AgentAction[] = [
    ...validRoutes.map((route) => ({
      type: 'navigate' as const,
      to: route,
    })),
    ...validModalIds.map((modalId) => ({
      type: 'open_modal' as const,
      id: modalId,
    })),
  ];
  const firstNavigateAction = normalizedActions.find(
    (action) => action.type === 'navigate'
  );
  const normalizedUi = normalizeUiBlocks(ui);
  const normalizedSections = normalizeSections(sections);

  return {
    answer: parsed.answer || '目前沒有可用回覆，請再試一次。',
    usedTools: Array.from(new Set(usedTools)),
    actions: normalizedActions,
    ui: normalizedUi,
    sections: normalizedSections,
    ...(firstNavigateAction ? { navigateTo: firstNavigateAction.to } : {}),
    ...(validModalIds[0] ? { openModalId: validModalIds[0] } : {}),
  };
}

export function createSystemPrompt(
  availableRoutes: string[],
  availableModals: string[]
): string {
  const routes = normalizeAvailableRoutes(availableRoutes).join(', ');
  const modals = normalizeAvailableModals(availableModals).join(', ');
  return [
    'You are a practical AI agent for developers.',
    'Answer in Traditional Chinese unless user asks otherwise.',
    'Use tools when they improve accuracy.',
    'When user asks to add finance data, use createFinanceItem with kind/category/amount.',
    'When user asks for finance distribution or trend visualization, call getFinanceOverview first.',
    `Allowed website routes: ${routes}.`,
    `Allowed modal ids: ${modals}.`,
    'If you can return structured fields, use actions with { type: "navigate", to: "/route" } and { type: "open_modal", id: "modal-id" }.',
    'If user asks for chart/visualization/data distribution, include UI blocks in field ui.',
    'Supported ui block types: asset_donut and finance_trend_line.',
    'asset_donut needs items: [{ label, amount }]. finance_trend_line needs points: [{ label, assets, liabilities }].',
    'If user asks to add a new page section/canvas/module, return sections with slot "after-b" and one or more ui blocks.',
    'When user clearly asks to go/open/navigate to a page, append one tag exactly like <<NAVIGATE:/route>> at the end of your answer.',
    'When user asks to open a modal/dialog/popup, append one tag like <<OPEN_MODAL:modal-id>>.',
    'Only use allowed routes.',
    'Only use allowed modal ids.',
  ].join(' ');
}
