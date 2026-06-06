import type { Stock } from "../types";
import { CURATED_WATCHLIST } from "./watchlist";

/**
 * Financial Modeling Prep adapter — uses the current "/stable/" API.
 *
 * NOTE: FMP retired the legacy "/api/v3/" and "/api/v4/" endpoints after
 * 2025-08-31; newer keys get 403 there. This adapter targets the supported
 * "/stable/" endpoints.
 *
 * We fetch a curated watchlist (predictable, cheap) rather than the whole
 * market, and every sub-request degrades gracefully: if an endpoint isn't on
 * your plan it falls back to a neutral default and scoring still works from the
 * signals we do have. Results are cached (see CACHE_SECONDS) to respect the
 * free tier's ~250 requests/day budget.
 */

const BASE = "https://financialmodelingprep.com/stable";
// 12h cache + a trimmed watchlist + 5 calls/symbol keeps us under the free
// tier's ~250 requests/day budget (≈ 15 × 5 = 75 calls per refresh, ≤2/day).
const CACHE_SECONDS = 60 * 60 * 12;

const WATCHLIST = CURATED_WATCHLIST;
const SECTOR_BY_SYMBOL = new Map(WATCHLIST.map((w) => [w.symbol, w.sector]));

function stripKey(url: string): string {
  return url.replace(/apikey=[^&]+/, "apikey=***");
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

/** Some stable endpoints return a single object, others a one-item array. */
function firstOf<T>(data: unknown): T | undefined {
  if (Array.isArray(data)) return data[0] as T | undefined;
  if (data && typeof data === "object") return data as T;
  return undefined;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${stripKey(url)}`);
  return (await res.json()) as T;
}

/** Best-effort fetch: returns null instead of throwing, for optional fields. */
async function tryJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface FmpQuote {
  symbol: string;
  name?: string;
  price?: number;
  marketCap?: number;
  pe?: number | null;
}

/** Estimate RSI from 3-month momentum (the indicator endpoint is premium). */
function estimateRsi(change3M: number): number {
  return Math.min(85, Math.max(20, 50 + change3M * 0.4));
}

interface FetchOpts {
  sector?: string;
  forward: boolean;
}

async function fetchOne(
  symbol: string,
  key: string,
  opts: FetchOpts
): Promise<Stock | null> {
  const q = `symbol=${symbol}&${key}`;

  // 5 core calls per symbol. (price-target-consensus dropped to conserve quota.)
  const [quote, changeRes, ratios, growth, grades] = await Promise.all([
    tryJson<unknown>(`${BASE}/quote?${q}`),
    tryJson<unknown>(`${BASE}/stock-price-change?${q}`),
    tryJson<unknown>(`${BASE}/ratios-ttm?${q}`),
    // limit=2 so we can compute growth ACCELERATION (this year vs last year)
    tryJson<unknown>(`${BASE}/income-statement-growth?${q}&limit=2`),
    tryJson<unknown>(`${BASE}/grades-consensus?${q}`),
  ]);

  const quoteRow = firstOf<FmpQuote>(quote);
  if (!quoteRow || !num(quoteRow.price)) return null; // no usable price -> skip

  const change = firstOf<Record<string, number>>(changeRes) ?? {};
  const ratiosRow =
    firstOf<{ grossProfitMarginTTM?: number; priceToSalesRatioTTM?: number }>(
      ratios
    ) ?? {};
  const growthRows = Array.isArray(growth)
    ? (growth as Array<{ growthRevenue?: number; growthNetIncome?: number }>)
    : [];
  const growthRow = growthRows[0] ?? {};
  // Acceleration in percentage points: latest YoY growth minus prior year's.
  const revenueAcceleration =
    growthRows.length >= 2
      ? (num(growthRows[0].growthRevenue) - num(growthRows[1].growthRevenue)) *
        100
      : 0;
  const gradesRow = firstOf<{
    strongBuy?: number;
    buy?: number;
    hold?: number;
    sell?: number;
    strongSell?: number;
  }>(grades);

  const price = num(quoteRow.price);
  // We no longer fetch price targets (quota); leave upside neutral.
  const priceTargetUpside = 0;

  const hasGrades =
    gradesRow &&
    (gradesRow.strongBuy ||
      gradesRow.buy ||
      gradesRow.hold ||
      gradesRow.sell ||
      gradesRow.strongSell);
  const analystBuy = hasGrades
    ? num(gradesRow!.strongBuy) + num(gradesRow!.buy)
    : 8;
  const analystHold = hasGrades ? num(gradesRow!.hold) : 6;
  const analystSell = hasGrades
    ? num(gradesRow!.sell) + num(gradesRow!.strongSell)
    : 2;

  const change3M = num(change["3M"]);
  const change1Y = num(change["1Y"]);
  const changeYTD = num(change["ytd"]);

  // Optional forward-looking signals (2 extra calls; off by default for quota).
  let forwardRevenueGrowth: number | undefined;
  let earningsSurpriseStreak: number | undefined;
  if (opts.forward) {
    const [estimates, surprises] = await Promise.all([
      tryJson<unknown>(`${BASE}/analyst-estimates?${q}&period=annual&limit=2`),
      tryJson<unknown>(`${BASE}/earnings-surprises?${q}&limit=4`),
    ]);
    const estRows = Array.isArray(estimates)
      ? (estimates as Array<{ estimatedRevenueAvg?: number; date?: string }>)
      : [];
    // Sort by date ascending so [0]=nearest year, [1]=following year.
    estRows.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    if (estRows.length >= 2) {
      const cur = num(estRows[0].estimatedRevenueAvg);
      const next = num(estRows[1].estimatedRevenueAvg);
      if (cur > 0) forwardRevenueGrowth = ((next - cur) / cur) * 100;
    }
    const surpRows = Array.isArray(surprises)
      ? (surprises as Array<{
          actualEarningResult?: number;
          estimatedEarning?: number;
        }>)
      : [];
    if (surpRows.length > 0) {
      earningsSurpriseStreak = surpRows
        .slice(0, 4)
        .filter(
          (r) => num(r.actualEarningResult) > num(r.estimatedEarning)
        ).length;
    }
  }

  return {
    symbol,
    name: quoteRow.name ?? symbol,
    sector: opts.sector ?? SECTOR_BY_SYMBOL.get(symbol) ?? "—",
    price,
    marketCap: num(quoteRow.marketCap),
    revenueGrowthYoY: num(growthRow.growthRevenue) * 100,
    earningsGrowthYoY: num(growthRow.growthNetIncome) * 100,
    revenueAcceleration,
    grossMargin: num(ratiosRow.grossProfitMarginTTM) * 100,
    priceChange3M: change3M,
    priceChange1Y: change1Y,
    priceChangeYTD: changeYTD,
    rsi: estimateRsi(change3M),
    analystBuy,
    analystHold,
    analystSell,
    priceTargetUpside,
    forwardRevenueGrowth,
    earningsSurpriseStreak,
    peRatio: quoteRow.pe ?? null,
    psRatio: num(ratiosRow.priceToSalesRatioTTM),
  };
}

interface ScreenerRow {
  symbol: string;
  sector?: string;
  marketCap?: number;
}

/**
 * Full-market universe via the stock screener (1 call). Tilts to small/mid-cap,
 * actively-traded, non-ETF names — the hunting ground for future breakouts.
 */
async function fetchScreenerUniverse(
  key: string,
  max: number
): Promise<{ symbol: string; sector: string }[]> {
  const params = [
    "marketCapMoreThan=500000000",
    "marketCapLowerThan=30000000000",
    "volumeMoreThan=300000",
    "isActivelyTrading=true",
    "isEtf=false",
    "isFund=false",
    `limit=${Math.min(max * 4, 200)}`,
    key,
  ].join("&");
  const rows =
    (await tryJson<ScreenerRow[]>(`${BASE}/company-screener?${params}`)) ?? [];
  return rows
    .filter((r) => r.symbol && (r.marketCap ?? 0) > 0)
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)) // larger (more liquid) first within the small/mid band
    .slice(0, max)
    .map((r) => ({ symbol: r.symbol, sector: r.sector ?? "—" }));
}

export async function fetchFmpStocks(apiKey: string): Promise<Stock[]> {
  const key = `apikey=${apiKey}`;
  const useScreener = (process.env.FMP_UNIVERSE ?? "watchlist") === "screener";
  const forward = (process.env.FMP_FORWARD ?? "false") === "true";
  const maxSymbols = Math.max(
    5,
    Math.min(40, Number(process.env.FMP_MAX_SYMBOLS ?? (forward ? 15 : 20)))
  );

  // Probe one symbol first so a bad key / wrong plan / rate limit surfaces a
  // clear error (instead of silently returning an empty list).
  const probe = await fetchJson<unknown>(`${BASE}/quote?symbol=NVDA&${key}`);
  if (!firstOf<FmpQuote>(probe)) {
    throw new Error("FMP returned no quote data (check key/plan)");
  }

  const universe = useScreener
    ? await fetchScreenerUniverse(key, maxSymbols)
    : WATCHLIST.slice(0, maxSymbols);

  const results = await Promise.all(
    universe.map((u) => fetchOne(u.symbol, key, { sector: u.sector, forward }))
  );
  return results.filter(
    (s): s is Stock => s !== null && s.price > 0 && s.marketCap > 0
  );
}
