import { NextResponse } from "next/server";

import {
  createFinanceItem,
  listFinanceItems,
  type FinanceKind,
} from "@/lib/server/finance-store";

export const runtime = "nodejs";

function parseKind(value: unknown): FinanceKind | null {
  return value === "asset" || value === "liability" ? value : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(200, Math.trunc(limitParam)))
    : 100;

  const items = listFinanceItems(limit);
  return NextResponse.json({ items, count: items.length });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const kind = parseKind(body?.kind);
    const category =
      typeof body?.category === "string" ? body.category : undefined;
    const amount =
      typeof body?.amount === "number"
        ? body.amount
        : Number.parseFloat(String(body?.amount ?? ""));

    if (!kind) {
      return NextResponse.json(
        { error: "kind must be asset or liability" },
        { status: 400 }
      );
    }

    if (!category) {
      return NextResponse.json(
        { error: "category is required" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(amount)) {
      return NextResponse.json(
        { error: "amount must be a number" },
        { status: 400 }
      );
    }

    const created = createFinanceItem({ kind, category, amount });
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "failed to create item";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
