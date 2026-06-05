import type { Stock } from "../types";
import { MOCK_STOCKS } from "./mockStocks";
import { fetchFmpStocks } from "./fmp";

/**
 * Returns the universe of stocks to score. The provider is selected via the
 * DATA_PROVIDER env var so the app runs with zero setup (mock) and upgrades to
 * live data (fmp) by only changing environment variables.
 */
export async function getStocks(): Promise<{
  stocks: Stock[];
  source: "mock" | "fmp";
  notice?: string;
}> {
  const provider = (process.env.DATA_PROVIDER ?? "mock").toLowerCase();

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
      return {
        stocks: MOCK_STOCKS,
        source: "mock",
        notice: `FMP request failed (${
          err instanceof Error ? err.message : "unknown error"
        }) — falling back to demo data.`,
      };
    }
  }

  return { stocks: MOCK_STOCKS, source: "mock" };
}
