import type {
  AgentAction,
  AgentChatResponse,
  AgentSection,
  AgentUiBlock,
} from "@/lib/agent-contract";
import { isAgentSection, isAgentUiBlock } from "@/lib/agent-guards";

type ParsedSseEvent = {
  event: string;
  data: string;
};

export type AgentStreamEvent =
  | {
      type: "text_delta";
      delta: string;
    }
  | {
      type: "ui";
      block: AgentUiBlock;
    }
  | {
      type: "section";
      section: AgentSection;
    }
  | {
      type: "actions";
      response: AgentChatResponse;
    }
  | {
      type: "done";
      response: AgentChatResponse;
    }
  | {
      type: "error";
      error: string;
    };

function parseSseEvent(rawBlock: string): ParsedSseEvent | null {
  const lines = rawBlock
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return null;
  }

  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function mergeActions(response: AgentChatResponse): AgentAction[] {
  const actions = [...(response.actions ?? [])];
  if (response.navigateTo && !actions.some((action) => action.type === "navigate")) {
    actions.push({ type: "navigate", to: response.navigateTo });
  }
  if (
    response.openModalId &&
    !actions.some((action) => action.type === "open_modal")
  ) {
    actions.push({ type: "open_modal", id: response.openModalId });
  }
  return actions;
}

export async function* readAgentStream(
  response: Response
): AsyncGenerator<AgentStreamEvent> {
  if (!response.body) {
    throw new Error("Agent stream body is empty");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let eventBoundary = buffer.indexOf("\n\n");

    while (eventBoundary >= 0) {
      const rawBlock = buffer.slice(0, eventBoundary);
      buffer = buffer.slice(eventBoundary + 2);
      eventBoundary = buffer.indexOf("\n\n");

      const parsed = parseSseEvent(rawBlock);
      if (!parsed) {
        continue;
      }

      const payload = tryParseJson(parsed.data);
      if (parsed.event === "text_delta") {
        const delta =
          payload && typeof payload === "object" && "delta" in payload
            ? typeof payload.delta === "string"
              ? payload.delta
              : ""
            : "";
        if (delta) {
          yield { type: "text_delta", delta };
        }
        continue;
      }

      if (parsed.event === "ui") {
        const block =
          payload && typeof payload === "object" && "block" in payload
            ? payload.block
            : null;
        if (isAgentUiBlock(block)) {
          yield { type: "ui", block };
        }
        continue;
      }

      if (parsed.event === "section") {
        const section =
          payload && typeof payload === "object" && "section" in payload
            ? payload.section
            : null;
        if (isAgentSection(section)) {
          yield { type: "section", section };
        }
        continue;
      }

      if (parsed.event === "actions" && payload && typeof payload === "object") {
        yield {
          type: "actions",
          response: payload as AgentChatResponse,
        };
        continue;
      }

      if (parsed.event === "done" && payload && typeof payload === "object") {
        yield {
          type: "done",
          response: payload as AgentChatResponse,
        };
        continue;
      }

      if (parsed.event === "error") {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? typeof payload.error === "string"
              ? payload.error
              : "Agent stream failed"
            : "Agent stream failed";
        yield {
          type: "error",
          error: message,
        };
      }
    }
  }
}
