export const runtime = "nodejs";

const DEFAULT_AI_BASE_URL = "http://localhost:3010";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const aiBaseUrl = process.env.AI_AGENT_BASE_URL ?? DEFAULT_AI_BASE_URL;

    const upstream = await fetch(`${aiBaseUrl}/api/agent/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!upstream.body) {
      return new Response(JSON.stringify({ error: "Empty stream response" }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Agent stream proxy failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
