// Core domain types for the Hotstocks screener.

/** Raw, provider-agnostic snapshot of a single stock. */
export interface Stock {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  /** Market capitalization in USD. */
  marketCap: number;

  // --- Fundamentals (growth) ---
  /** Year-over-year revenue growth, in percent. e.g. 45 => +45%. */
  revenueGrowthYoY: number;
  /** Year-over-year earnings growth, in percent. */
  earningsGrowthYoY: number;
  /** Gross margin, in percent. */
  grossMargin: number;

  // --- Momentum (technical) ---
  /** Price change over the last 3 months, in percent. */
  priceChange3M: number;
  /** Price change over the last 12 months, in percent. */
  priceChange1Y: number;
  /** Relative Strength Index (0-100). */
  rsi: number;

  // --- Analyst sentiment ---
  analystBuy: number;
  analystHold: number;
  analystSell: number;
  /** Average analyst price-target upside vs current price, in percent. */
  priceTargetUpside: number;

  // --- Valuation ---
  /** Price/Earnings ratio. null when not profitable. */
  peRatio: number | null;
  /** Price/Sales ratio. */
  psRatio: number;

  /** Optional short, human catalysts (kept generic in mock data). */
  catalysts?: string[];
}

/** A single named contributor to the overall Hotness score. */
export interface FactorBreakdown {
  key: "growth" | "momentum" | "analyst" | "earlyStage" | "valuation";
  label: string;
  /** Normalized sub-score 0-100. */
  score: number;
  /** Weight applied to this factor in the final score (0-1). */
  weight: number;
  /** Human-readable reason string for the "Why" view. */
  reason: string;
}

export type Timeframe = "0–3 months" | "3–9 months" | "9–24 months";

/** A stock enriched with computed scores and explanations. */
export interface ScoredStock extends Stock {
  /** Overall 0-100 hotness score. */
  hotness: number;
  /** "Next Nvidia" potential: rewards early-stage + high growth. 0-100. */
  nextGenScore: number;
  /** Estimated window in which a re-rating could play out. */
  timeframe: Timeframe;
  /** Confidence in the timeframe/thesis, 0-100. */
  confidence: number;
  factors: FactorBreakdown[];
  /** Top 3 reason strings, ordered by contribution. */
  topReasons: string[];
}
