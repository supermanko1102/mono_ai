import { NextResponse } from "next/server";

const DEFAULT_AI_BASE_URL = "http://localhost:3010";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const aiBaseUrl = process.env.AI_AGENT_BASE_URL ?? DEFAULT_AI_BASE_URL;

    const upstream = await fetch(`${aiBaseUrl}/api/agent/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Agent proxy failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
