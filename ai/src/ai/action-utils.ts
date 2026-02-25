import {
  DEFAULT_AVAILABLE_MODALS,
  DEFAULT_AVAILABLE_ROUTES,
} from '../shared/agent-contract.js';
import type { AgentAction, AgentOutput } from './agent-schema.js';

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

export function finalizeAgentOutput({
  answer,
  usedTools,
  availableRoutes,
  availableModals,
  actions,
  navigateTo,
  openModalId,
}: {
  answer: string;
  usedTools: string[];
  availableRoutes: string[];
  availableModals: string[];
  actions?: AgentAction[];
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

  return {
    answer: parsed.answer || '目前沒有可用回覆，請再試一次。',
    usedTools: Array.from(new Set(usedTools)),
    actions: normalizedActions,
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
    `Allowed website routes: ${routes}.`,
    `Allowed modal ids: ${modals}.`,
    'If you can return structured fields, use actions with { type: "navigate", to: "/route" } and { type: "open_modal", id: "modal-id" }.',
    'When user clearly asks to go/open/navigate to a page, append one tag exactly like <<NAVIGATE:/route>> at the end of your answer.',
    'When user asks to open a modal/dialog/popup, append one tag like <<OPEN_MODAL:modal-id>>.',
    'Only use allowed routes.',
    'Only use allowed modal ids.',
  ].join(' ');
}
