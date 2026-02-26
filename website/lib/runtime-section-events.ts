import type { AgentSection } from "@/lib/agent-contract";

export const AGENT_SECTION_CREATE_EVENT = "agent:section:create";
export const AGENT_SECTION_REMOVE_EVENT = "agent:section:remove";

export function emitAgentSectionCreate(section: AgentSection) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<AgentSection>(AGENT_SECTION_CREATE_EVENT, {
      detail: section,
    })
  );
}

export function emitAgentSectionRemove(sectionId: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<{ id: string }>(AGENT_SECTION_REMOVE_EVENT, {
      detail: { id: sectionId },
    })
  );
}
