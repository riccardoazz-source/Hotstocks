import yahooFinance from "yahoo-finance2";
import type { Stock } from "../types";
import { CURATED_WATCHLIST } from "./watchlist";

/**
 * Yahoo Finance adapter (free, no API key).
 *
 * Yahoo is an UNOFFICIAL data source: generous and rich, but it can change or
 * rate-limit requests from datacenter IPs. Every field degrades gracefully and
 * the provider layer falls back to demo data if Yahoo is unreachable.
 *
 * Two calls per symbol: one `quoteSummary` (many modules at once) for
 * fundamentals + analyst data, and one `chart` for trailing price changes.
 */

// Quiet the library's startup notices/survey in server logs.
try {
  // @ts-expect-error suppressNotices exists at runtime in v3
  yahooFinance.suppressNotices?.(["yahooSurvey"]);
} catch {
  /* noop */
}

const OPTS = { validateResult: false } as const;

/** Read a numeric field that may be a number, a {raw} object, or missing. */
function num(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (v && typeof v === "object" && "raw" in (v as Record<string, unknown>)) {
    const raw = (v as { raw: unknown }).raw;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  }
  return fallback;
}

/** Run an async mapper over items with bounded concurrency. */
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

const MODULES = [
  "price",
  "summaryDetail",
  "financialData",
  "recommendationTrend",
  "incomeStatementHistory",
  "earningsTrend",
  "earningsHistory",
] as const;

/** Compute trailing price changes (%) from a daily chart. */
function priceChanges(quotes: Array<{ date: Date; close: number | null }>): {
  c3m: number;
  c1y: number;
  ytd: number;
} {
  const pts = quotes
    .filter((q) => typeof q.close === "number" && q.close! > 0)
    .map((q) => ({ t: q.date.getTime(), c: q.close as number }));
  if (pts.length < 2) return { c3m: 0, c1y: 0, ytd: 0 };
  const last = pts[pts.length - 1].c;
  const now = pts[pts.length - 1].t;
  const closeAtOrAfter = (target: number) =>
    pts.find((p) => p.t >= target)?.c ?? pts[0].c;
  const day = 86400000;
  const yearStart = new Date(new Date(now).getFullYear(), 0, 1).getTime();
  const pct = (from: number) => (from > 0 ? (last / from - 1) * 100 : 0);
  return {
    c3m: pct(closeAtOrAfter(now - 91 * day)),
    c1y: pct(pts[0].c),
    ytd: pct(closeAtOrAfter(yearStart)),
  };
}

async function fetchOne(
  symbol: string,
  sector: string
): Promise<Stock | null> {
  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const chartPromise = (
      yahooFinance.chart(
        symbol,
        { period1: oneYearAgo, interval: "1d" },
        OPTS
      ) as Promise<unknown>
    ).catch(() => null);

    const [summary, chart] = await Promise.all([
      yahooFinance.quoteSummary(
        symbol,
        { modules: MODULES as unknown as string[] },
        OPTS
      ),
      chartPromise,
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = summary as any;
    const price = num(s?.price?.regularMarketPrice);
    const marketCap = num(s?.price?.marketCap);
    if (price <= 0 || marketCap <= 0) return null;

    const fin = s?.financialData ?? {};
    const detail = s?.summaryDetail ?? {};

    // Revenue acceleration from the last 3 annual revenues (most recent first).
    const incomes: Array<{ totalRevenue?: unknown }> =
      s?.incomeStatementHistory?.incomeStatementHistory ?? [];
    const rev = incomes.map((r) => num(r.totalRevenue)).filter((x) => x > 0);
    let revenueAcceleration = 0;
    if (rev.length >= 3) {
      const g0 = (rev[0] - rev[1]) / rev[1];
      const g1 = (rev[1] - rev[2]) / rev[2];
      revenueAcceleration = (g0 - g1) * 100;
    }

    // Analyst recommendation counts (most recent period).
    const trend = s?.recommendationTrend?.trend?.[0] ?? {};
    const analystBuy = num(trend.strongBuy) + num(trend.buy);
    const analystHold = num(trend.hold);
    const analystSell = num(trend.sell) + num(trend.strongSell);
    const hasCoverage = analystBuy + analystHold + analystSell > 0;

    // Forward outlook: next-year revenue estimate growth + EPS revision trend.
    const eTrend: Array<{ period?: string; revenueEstimate?: { growth?: unknown }; epsTrend?: Record<string, unknown> }> =
      s?.earningsTrend?.trend ?? [];
    const nextYear = eTrend.find((t) => t.period === "+1y");
    const forwardRevenueGrowth = nextYear?.revenueEstimate?.growth
      ? num(nextYear.revenueEstimate.growth) * 100
      : undefined;
    let estimateRevisionTrend: number | undefined;
    if (nextYear?.epsTrend) {
      const cur = num(nextYear.epsTrend.current);
      const ago = num(nextYear.epsTrend["30daysAgo"]);
      if (cur && ago) estimateRevisionTrend = cur > ago ? 1 : cur < ago ? -1 : 0;
    }

    // Earnings surprise streak over the last up-to-4 quarters.
    const history: Array<{ epsActual?: unknown; epsEstimate?: unknown }> =
      s?.earningsHistory?.history ?? [];
    const earningsSurpriseStreak =
      history.length > 0
        ? history
            .slice(-4)
            .filter((h) => num(h.epsActual) > num(h.epsEstimate)).length
        : undefined;

    const targetMean = num(fin.targetMeanPrice);
    const priceTargetUpside =
      targetMean > 0 && price > 0 ? ((targetMean - price) / price) * 100 : 0;

    const { c3m, c1y, ytd } = priceChanges(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((chart as any)?.quotes ?? []) as Array<{ date: Date; close: number | null }>
    );

    return {
      symbol,
      name: s?.price?.longName ?? s?.price?.shortName ?? symbol,
      sector,
      price,
      marketCap,
      revenueGrowthYoY: num(fin.revenueGrowth) * 100,
      earningsGrowthYoY: num(fin.earningsGrowth) * 100,
      revenueAcceleration,
      grossMargin: num(fin.grossMargins) * 100,
      priceChange3M: c3m,
      priceChange1Y: c1y,
      priceChangeYTD: ytd,
      rsi: Math.min(85, Math.max(20, 50 + c3m * 0.4)),
      analystBuy: hasCoverage ? analystBuy : 8,
      analystHold: hasCoverage ? analystHold : 6,
      analystSell: hasCoverage ? analystSell : 2,
      priceTargetUpside,
      forwardRevenueGrowth,
      estimateRevisionTrend,
      earningsSurpriseStreak,
      peRatio: detail.trailingPE ? num(detail.trailingPE) : null,
      psRatio: num(detail.priceToSalesTrailing12Months),
    };
  } catch {
    return null; // graceful: skip this symbol
  }
}

export async function fetchYahooStocks(): Promise<Stock[]> {
  const max = Math.max(
    5,
    Math.min(40, Number(process.env.YAHOO_MAX_SYMBOLS ?? CURATED_WATCHLIST.length))
  );
  const universe = CURATED_WATCHLIST.slice(0, max);

  // Probe one symbol so a hard failure (blocked/changed API) surfaces clearly.
  const probe = await fetchOne(universe[0].symbol, universe[0].sector);
  if (!probe) {
    throw new Error("Yahoo Finance returned no usable data (blocked or changed?)");
  }

  const rest = await mapLimit(universe.slice(1), 5, (u) =>
    fetchOne(u.symbol, u.sector)
  );
  return [probe, ...rest].filter(
    (s): s is Stock => s !== null && s.price > 0 && s.marketCap > 0
  );
}
