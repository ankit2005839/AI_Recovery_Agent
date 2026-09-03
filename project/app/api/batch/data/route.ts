import { generateMockBatch, resetMockIdCounter } from "@/lib/mockData";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const count = Math.max(20, Math.min(200, Number(searchParams.get("count")) || 55));
  const seed = Number(searchParams.get("seed")) || 42;

  resetMockIdCounter();
  const pairs = generateMockBatch(count, seed);

  return NextResponse.json({ pairs, count: pairs.length });
}
