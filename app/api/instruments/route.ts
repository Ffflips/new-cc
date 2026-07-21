import { NextResponse } from "next/server";
import { SUPPORTED_INSTRUMENTS } from "@/lib/okx";

export async function GET() {
  return NextResponse.json({ instruments: SUPPORTED_INSTRUMENTS });
}
