import { NextRequest, NextResponse } from "next/server";
import { runBackfill } from "@/lib/backfill-core";
import type { Bar } from "@/lib/okx";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds — bump in vercel.json / project settings if on Pro+

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const instId = searchParams.get("instId") ?? "BTC-USDT-SWAP";
  const bar = (searchParams.get("bar") ?? "1m") as Bar;
  // Keep this small for a serverless-function-triggered run — Vercel functions
  // have execution time limits. For a real 2-year backfill, run
  // `npm run backfill` locally/on a VM against the same KV instance instead.
  const pages = Math.min(Number(searchParams.get("pages") ?? 5), 20);

  try {
    const result = await runBackfill({ instId, bar, pages });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
