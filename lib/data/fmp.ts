import type { Stock } from "../types";

/**
 * Financial Modeling Prep adapter.
 *
 * Maps FMP responses onto our provider-agnostic `Stock` shape. We fetch a
 * curated watchlist (cheap, predictable) rather than the full market so the app
 * stays well within free-tier limits. Every sub-request degrades gracefully:
 * if an endpoint is unavailable on your plan, that field falls back to a
 * neutral default and scoring still works from the signals we do have.
 */

const BASE = "https://financialmodelingprep.com";

/** Curated universe to score. Edit freely — these drive the screener. */
const WATCHLIST = [
  "NVDA", "MU", "SNDK", "VRT", "CLS", "ALAB", "CRDO", "SMCI", "ARM", "PLTR",
  "TSM", "DELL", "ANET", "ONTO", "NXT", "CAVA", "DUOL", "RKLB", "IOT", "ASML",
  "INTC", "ENPH", "AMD", "NBIS", "AVGO", "MRVL", "COHR", "TSLA", "MELI", "NET",
];

const SECTOR_FALLBACK = "—";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 60 * 30 } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${stripKey(url)}`);
  return (await res.json()) as T;
}

/** Best-effort fetch: returns null instead of throwing, for optional fields. */
async function tryJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 60 * 30 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function stripKey(url: string): string {
  return url.replace(/apikey=[^&]+/, "apikey=***");
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

interface FmpQuote {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  pe: number | null;
}

interface FmpPriceChange {
  symbol: string;
  "3M": number;
  "1Y": number;
}

/** Estimate RSI from 3-month momentum when the indicator endpoint is premium. */
function estimateRsi(change3M: number): number {
  return Math.min(85, Math.max(20, 50 + change3M * 0.4));
}

export async function fetchFmpStocks(apiKey: string): Promise<Stock[]> {
  const symbols = WATCHLIST.join(",");
  const key = `apikey=${apiKey}`;

  // --- Bulk calls (1 request each) ---
  const quotes = await fetchJson<FmpQuote[]>(
    `${BASE}/api/v3/quote/${symbols}?${key}`
  );
  const changes =
    (await tryJson<FmpPriceChange[]>(
      `${BASE}/api/v3/stock-price-change/${symbols}?${key}`
    )) ?? [];

  const changeBySymbol = new Map(changes.map((c) => [c.symbol, c]));

  // --- Per-symbol enrichment (graceful) ---
  const stocks = await Promise.all(
    quotes.map(async (q): Promise<Stock> => {
      const sym = q.symbol;

      const [profileArr, ratiosArr, growthArr, targetArr, consensusArr] =
        await Promise.all([
          tryJson<Array<{ sector?: string; companyName?: string }>>(
            `${BASE}/api/v3/profile/${sym}?${key}`
          ),
          tryJson<
            Array<{
              grossProfitMarginTTM?: number;
              priceToSalesRatioTTM?: number;
            }>
          >(`${BASE}/api/v3/ratios-ttm/${sym}?${key}`),
          tryJson<
            Array<{ growthRevenue?: number; growthNetIncome?: number }>
          >(`${BASE}/api/v3/income-statement-growth/${sym}?limit=1&${key}`),
          tryJson<{ targetConsensus?: number }>(
            `${BASE}/api/v4/price-target-consensus?symbol=${sym}&${key}`
          ),
          tryJson<{
            strongBuy?: number;
            buy?: number;
            hold?: number;
            sell?: number;
            strongSell?: number;
          }>(`${BASE}/api/v4/upgrades-downgrades-consensus?symbol=${sym}&${key}`),
        ]);

      const profile = profileArr?.[0];
      const ratios = ratiosArr?.[0];
      const growth = growthArr?.[0];
      const change = changeBySymbol.get(sym);

      const price = num(q.price);
      const target = num(targetArr?.targetConsensus, price);
      const priceTargetUpside =
        price > 0 ? ((target - price) / price) * 100 : 0;

      // Analyst counts: use consensus if present, else a neutral default.
      const hasConsensus =
        consensusArr &&
        (consensusArr.strongBuy ||
          consensusArr.buy ||
          consensusArr.hold ||
          consensusArr.sell ||
          consensusArr.strongSell);
      const analystBuy = hasConsensus
        ? num(consensusArr!.strongBuy) + num(consensusArr!.buy)
        : 8;
      const analystHold = hasConsensus ? num(consensusArr!.hold) : 6;
      const analystSell = hasConsensus
        ? num(consensusArr!.sell) + num(consensusArr!.strongSell)
        : 2;

      const change3M = num(change?.["3M"]);
      const change1Y = num(change?.["1Y"]);

      return {
        symbol: sym,
        name: profile?.companyName ?? q.name ?? sym,
        sector: profile?.sector ?? SECTOR_FALLBACK,
        price,
        marketCap: num(q.marketCap),
        revenueGrowthYoY: num(growth?.growthRevenue) * 100,
        earningsGrowthYoY: num(growth?.growthNetIncome) * 100,
        grossMargin: num(ratios?.grossProfitMarginTTM) * 100,
        priceChange3M: change3M,
        priceChange1Y: change1Y,
        rsi: estimateRsi(change3M),
        analystBuy,
        analystHold,
        analystSell,
        priceTargetUpside,
        peRatio: q.pe ?? null,
        psRatio: num(ratios?.priceToSalesRatioTTM),
      };
    })
  );

  return stocks.filter((s) => s.price > 0 && s.marketCap > 0);
}
