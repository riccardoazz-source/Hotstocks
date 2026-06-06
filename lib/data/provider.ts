import type { Stock } from "../types";
import { MOCK_STOCKS } from "./mockStocks";
import { fetchFmpStocks } from "./fmp";
import { fetchYahooStocks } from "./yahoo";

/**
 * Returns the universe of stocks to score. The provider is selected via the
 * DATA_PROVIDER env var so the app runs with zero setup (mock) and upgrades to
 * live data by only changing environment variables:
 *   - "mock"  (default) — bundled demo data, no setup
 *   - "yahoo"           — free, no API key (unofficial)
 *   - "fmp"             — Financial Modeling Prep (needs FMP_API_KEY)
 */
export async function getStocks(): Promise<{
  stocks: Stock[];
  source: "mock" | "fmp" | "yahoo";
  notice?: string;
}> {
  const provider = (process.env.DATA_PROVIDER ?? "mock").toLowerCase();

  if (provider === "yahoo") {
    try {
      const stocks = await fetchYahooStocks();
      if (stocks.length === 0) {
        return {
          stocks: MOCK_STOCKS,
          source: "mock",
          notice: "Yahoo returned no usable rows — falling back to demo data.",
        };
      }
      return { stocks, source: "yahoo" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      return {
        stocks: MOCK_STOCKS,
        source: "mock",
        notice: `Yahoo Finance unavailable (${msg}) — showing demo data.`,
      };
    }
  }

  if (provider === "fmp") {
    const key = process.env.FMP_API_KEY;
    if (!key) {
      return {
        stocks: MOCK_STOCKS,
        source: "mock",
        notice:
          "DATA_PROVIDER=fmp but FMP_API_KEY is missing — falling back to demo data.",
      };
    }
    try {
      const stocks = await fetchFmpStocks(key);
      if (stocks.length === 0) {
        return {
          stocks: MOCK_STOCKS,
          source: "mock",
          notice: "FMP returned no usable rows — falling back to demo data.",
        };
      }
      return { stocks, source: "fmp" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      // 429 = daily rate limit hit. Give a clear, reassuring message.
      const notice = msg.includes("429")
        ? "FMP daily rate limit reached — showing demo data. Live data resumes automatically once the free-tier quota resets (daily, ~midnight UTC)."
        : `FMP request failed (${msg}) — falling back to demo data.`;
      return { stocks: MOCK_STOCKS, source: "mock", notice };
    }
  }

  return { stocks: MOCK_STOCKS, source: "mock" };
}
