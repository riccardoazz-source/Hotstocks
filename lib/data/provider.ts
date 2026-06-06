import type { Stock } from "../types";
import { MOCK_STOCKS } from "./mockStocks";
import { fetchFmpStocks } from "./fmp";
import { fetchYahooStocks } from "./yahoo";
import { fetchFinnhubStocks } from "./finnhub";

export type Source = "mock" | "fmp" | "yahoo" | "finnhub";

export interface ProviderResult {
  stocks: Stock[];
  source: Source;
  notice?: string;
}

const errMsg = (err: unknown) =>
  err instanceof Error ? err.message : "unknown error";

/**
 * Returns the universe of stocks to score. Selected via the DATA_PROVIDER env
 * var so the app runs with zero setup (mock) and upgrades by only changing
 * environment variables:
 *   - "auto"  (recommended) — try Yahoo → Finnhub → demo, for a free + robust app
 *   - "yahoo"               — free, no API key (unofficial)
 *   - "finnhub"             — free key (FINNHUB_API_KEY), official & reliable
 *   - "fmp"                 — Financial Modeling Prep (FMP_API_KEY)
 *   - "mock"  (default)     — bundled demo data
 */
export async function getStocks(): Promise<ProviderResult> {
  const provider = (process.env.DATA_PROVIDER ?? "mock").toLowerCase();

  switch (provider) {
    case "auto":
      return getAuto();
    case "yahoo":
      return tryYahooResult();
    case "finnhub":
      return tryFinnhubResult();
    case "fmp":
      return tryFmpResult();
    default:
      return { stocks: MOCK_STOCKS, source: "mock" };
  }
}

/** Fallback chain: Yahoo (richest free data) → Finnhub (reliable) → demo. */
async function getAuto(): Promise<ProviderResult> {
  const notices: string[] = [];

  try {
    const stocks = await fetchYahooStocks();
    if (stocks.length > 0) return { stocks, source: "yahoo" };
    notices.push("Yahoo returned no rows");
  } catch (err) {
    notices.push(`Yahoo unavailable (${errMsg(err)})`);
  }

  const token = process.env.FINNHUB_API_KEY;
  if (token) {
    try {
      const stocks = await fetchFinnhubStocks(token);
      if (stocks.length > 0) {
        return {
          stocks,
          source: "finnhub",
          notice: `Yahoo unavailable, using Finnhub. (${notices.join("; ")})`,
        };
      }
      notices.push("Finnhub returned no rows");
    } catch (err) {
      notices.push(`Finnhub unavailable (${errMsg(err)})`);
    }
  } else {
    notices.push("no FINNHUB_API_KEY set");
  }

  return {
    stocks: MOCK_STOCKS,
    source: "mock",
    notice: `Live data unavailable — showing demo data. (${notices.join("; ")})`,
  };
}

// --- single-provider helpers (explicit modes) ---

async function tryYahooResult(): Promise<ProviderResult> {
  try {
    const stocks = await fetchYahooStocks();
    if (stocks.length === 0)
      return mockWith("Yahoo returned no usable rows — showing demo data.");
    return { stocks, source: "yahoo" };
  } catch (err) {
    return mockWith(`Yahoo Finance unavailable (${errMsg(err)}) — showing demo data.`);
  }
}

async function tryFinnhubResult(): Promise<ProviderResult> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token)
    return mockWith("DATA_PROVIDER=finnhub but FINNHUB_API_KEY is missing — showing demo data.");
  try {
    const stocks = await fetchFinnhubStocks(token);
    if (stocks.length === 0)
      return mockWith("Finnhub returned no usable rows — showing demo data.");
    return { stocks, source: "finnhub" };
  } catch (err) {
    const msg = errMsg(err);
    return mockWith(
      msg.includes("429")
        ? "Finnhub rate limit reached (60/min) — showing demo data; try again shortly."
        : `Finnhub request failed (${msg}) — showing demo data.`
    );
  }
}

async function tryFmpResult(): Promise<ProviderResult> {
  const key = process.env.FMP_API_KEY;
  if (!key)
    return mockWith("DATA_PROVIDER=fmp but FMP_API_KEY is missing — falling back to demo data.");
  try {
    const stocks = await fetchFmpStocks(key);
    if (stocks.length === 0)
      return mockWith("FMP returned no usable rows — falling back to demo data.");
    return { stocks, source: "fmp" };
  } catch (err) {
    const msg = errMsg(err);
    return mockWith(
      msg.includes("429")
        ? "FMP daily rate limit reached — showing demo data. Live data resumes once the free-tier quota resets (daily, ~midnight UTC)."
        : `FMP request failed (${msg}) — falling back to demo data.`
    );
  }
}

function mockWith(notice: string): ProviderResult {
  return { stocks: MOCK_STOCKS, source: "mock", notice };
}
