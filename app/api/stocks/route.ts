import { NextResponse } from "next/server";
import { getStocks } from "@/lib/data/provider";
import { scoreAll } from "@/lib/scoring";

// Re-score at most every 30 minutes; cheap and keeps us under API limits.
export const revalidate = 1800;

export async function GET() {
  const { stocks, source, notice } = await getStocks();
  const scored = scoreAll(stocks);
  return NextResponse.json({
    source,
    notice,
    generatedAt: new Date().toISOString(),
    count: scored.length,
    stocks: scored,
  });
}
