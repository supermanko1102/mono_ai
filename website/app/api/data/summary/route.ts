import { NextResponse } from "next/server";

import { getDashboardData } from "@/lib/server/finance-store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getDashboardData());
}
