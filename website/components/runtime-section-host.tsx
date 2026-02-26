"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import type { AgentSection, AgentSectionSlot } from "@/lib/agent-contract";
import { isAgentSection } from "@/lib/agent-guards";
import {
  AGENT_SECTION_CREATE_EVENT,
  AGENT_SECTION_REMOVE_EVENT,
  emitAgentSectionRemove,
} from "@/lib/runtime-section-events";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AgentUiBlockRenderer } from "@/components/agent-ui-block-renderer";

function upsertSection(list: AgentSection[], next: AgentSection): AgentSection[] {
  const index = list.findIndex((item) => item.id === next.id);
  if (index === -1) {
    return [...list, next];
  }
  const copied = [...list];
  copied[index] = next;
  return copied;
}

export function RuntimeSectionHost({ slot }: { slot: AgentSectionSlot }) {
  const [sections, setSections] = useState<AgentSection[]>([]);

  useEffect(() => {
    const onCreate = (event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      const detail = customEvent.detail;
      if (!isAgentSection(detail)) {
        return;
      }
      setSections((prev) => upsertSection(prev, detail));
    };

    const onRemove = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: unknown }>;
      const id =
        customEvent.detail && typeof customEvent.detail.id === "string"
          ? customEvent.detail.id
          : "";
      if (!id) {
        return;
      }
      setSections((prev) => prev.filter((section) => section.id !== id));
    };

    window.addEventListener(AGENT_SECTION_CREATE_EVENT, onCreate);
    window.addEventListener(AGENT_SECTION_REMOVE_EVENT, onRemove);

    return () => {
      window.removeEventListener(AGENT_SECTION_CREATE_EVENT, onCreate);
      window.removeEventListener(AGENT_SECTION_REMOVE_EVENT, onRemove);
    };
  }, []);

  const visibleSections = useMemo(
    () => sections.filter((section) => section.slot === slot),
    [sections, slot]
  );

  if (visibleSections.length === 0) {
    return null;
  }

  return (
    <section className="mt-3 space-y-3">
      {visibleSections.map((section) => (
        <Card key={section.id} className="rounded-xl border-cyan-200 bg-cyan-50/30 shadow-none">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700">
                  Agent Section
                </p>
                <CardTitle className="text-base text-slate-800">
                  {section.title ?? "Dynamic Section C"}
                </CardTitle>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7 border-cyan-300 text-cyan-700 hover:bg-cyan-100"
                onClick={() => emitAgentSectionRemove(section.id)}
                aria-label={`Remove ${section.id}`}
              >
                <X className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {section.blocks.map((block, index) => (
              <div
                key={`${section.id}-block-${index}`}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <AgentUiBlockRenderer block={block} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
