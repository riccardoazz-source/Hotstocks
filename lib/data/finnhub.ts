import type { Stock } from "../types";
import { CURATED_WATCHLIST } from "./watchlist";

/**
 * Finnhub adapter (free API key, 60 requests/minute, official & reliable).
 *
 * Free tier covers most of what the model needs via the "metric" endpoint
 * (growth, margins, valuation, 13/26/52-week + YTD price returns) plus quote
 * and recommendation trends — about 3 calls per symbol. Forward estimates and
 * price targets are premium on Finnhub, so the "Forward outlook" factor falls
 * back to current growth. Everything degrades gracefully.
 */

const BASE = "https://finnhub.io/api/v1";
const CACHE_SECONDS = 60 * 60 * 6;

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Finnhub returns some figures as ratios (0.45) and others as percents (45.2),
 * and it's inconsistent across metrics. Normalize to a percent heuristically:
 * tiny magnitudes are treated as ratios and scaled up.
 */
function asPercent(v: unknown): number {
  const n = num(v, NaN);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n) <= 3 ? n * 100 : n;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
    if (!res.ok) {
      if (res.status === 429) throw new Error("HTTP 429 (rate limit)");
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    // Surface rate limiting; swallow everything else as "field unavailable".
    if (err instanceof Error && err.message.includes("429")) throw err;
    return null;
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

interface Metric {
  metric?: Record<string, number>;
}

async function fetchOne(
  symbol: string,
  sector: string,
  token: string
): Promise<Stock | null> {
  const t = `token=${token}`;
  const [metricRes, quoteRes, recRes] = await Promise.all([
    getJson<Metric>(`${BASE}/stock/metric?symbol=${symbol}&metric=all&${t}`),
    getJson<{ c?: number }>(`${BASE}/quote?symbol=${symbol}&${t}`),
    getJson<
      Array<{ strongBuy?: number; buy?: number; hold?: number; sell?: number; strongSell?: number }>
    >(`${BASE}/stock/recommendation?symbol=${symbol}&${t}`),
  ]);

  const m = metricRes?.metric ?? {};
  const price = num(quoteRes?.c);
  const marketCap = num(m.marketCapitalization) * 1e6; // Finnhub reports millions
  if (price <= 0 || marketCap <= 0) return null;

  const revenueGrowthYoY = asPercent(m.revenueGrowthTTMYoy);
  const revenueGrowthQ = asPercent(m.revenueGrowthQuarterlyYoy);
  // Proxy for acceleration: most-recent quarter YoY vs trailing-twelve-months YoY.
  const revenueAcceleration =
    revenueGrowthQ && revenueGrowthYoY ? revenueGrowthQ - revenueGrowthYoY : 0;

  const rec = Array.isArray(recRes) ? recRes[0] ?? {} : {};
  const analystBuy = num(rec.strongBuy) + num(rec.buy);
  const analystHold = num(rec.hold);
  const analystSell = num(rec.sell) + num(rec.strongSell);
  const hasCoverage = analystBuy + analystHold + analystSell > 0;

  return {
    symbol,
    name: symbol,
    sector,
    price,
    marketCap,
    revenueGrowthYoY,
    earningsGrowthYoY: asPercent(m.epsGrowthTTMYoy),
    revenueAcceleration,
    grossMargin: asPercent(m.grossMarginTTM),
    priceChange3M: num(m["13WeekPriceReturnDaily"]),
    priceChange1Y: num(m["52WeekPriceReturnDaily"]),
    priceChangeYTD: num(m.yearToDatePriceReturnDaily),
    rsi: Math.min(85, Math.max(20, 50 + num(m["13WeekPriceReturnDaily"]) * 0.4)),
    analystBuy: hasCoverage ? analystBuy : 8,
    analystHold: hasCoverage ? analystHold : 6,
    analystSell: hasCoverage ? analystSell : 2,
    priceTargetUpside: 0, // premium on Finnhub free
    peRatio: num(m.peTTM) > 0 ? num(m.peTTM) : null,
    psRatio: num(m.psTTM),
  };
}

export async function fetchFinnhubStocks(token: string): Promise<Stock[]> {
  // Keep total calls under the 60/min free budget: ≤18 symbols × 3 calls.
  const max = Math.max(
    5,
    Math.min(20, Number(process.env.FINNHUB_MAX_SYMBOLS ?? 18))
  );
  const universe = CURATED_WATCHLIST.slice(0, max);

  // Probe one symbol so a bad key / rate limit surfaces clearly.
  const probe = await fetchOne(universe[0].symbol, universe[0].sector, token);
  if (!probe) {
    throw new Error("Finnhub returned no usable data (check key/plan)");
  }

  const rest = await mapLimit(universe.slice(1), 4, (u) =>
    fetchOne(u.symbol, u.sector, token)
  );
  return [probe, ...rest].filter(
    (s): s is Stock => s !== null && s.price > 0 && s.marketCap > 0
  );
}
