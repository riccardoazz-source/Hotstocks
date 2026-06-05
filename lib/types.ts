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
  /**
   * Change in the annual revenue-growth rate vs the prior year, in percentage
   * points. Positive => growth is accelerating (a key leading indicator).
   */
  revenueAcceleration: number;
  /** Gross margin, in percent. */
  grossMargin: number;

  // --- Momentum (technical) ---
  /** Price change over the last 3 months, in percent. */
  priceChange3M: number;
  /** Price change over the last 12 months, in percent. */
  priceChange1Y: number;
  /** Year-to-date price change, in percent. Falls back to 1Y when absent. */
  priceChangeYTD?: number;
  /** Relative Strength Index (0-100). */
  rsi: number;

  // --- Analyst sentiment / coverage ---
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

export type FactorKey =
  | "roomToRun"
  | "growth"
  | "acceleration"
  | "valuation"
  | "underRadar"
  | "momentum"
  | "quality";

/** A single named contributor to the overall Breakout score. */
export interface FactorBreakdown {
  key: FactorKey;
  label: string;
  /** Normalized sub-score 0-100. */
  score: number;
  /** Weight applied to this factor in the final score (0-1). */
  weight: number;
  /** Human-readable explanation for this factor. */
  reason: string;
}

export type Timeframe = "0–3 months" | "3–9 months" | "9–24 months";

/**
 * Where a stock is in its move. The whole app is about finding names BEFORE the
 * run, so this is surfaced prominently and heavily discounts late-stage names.
 */
export type Stage =
  | "Pre-breakout"
  | "Early uptrend"
  | "Mid-trend"
  | "Extended"
  | "Late · already ran";

/** A stock enriched with computed scores and explanations. */
export interface ScoredStock extends Stock {
  /**
   * Overall 0-100 forward-looking score: how much room + reason this name has
   * to *become* a breakout from here (not how much it already ran).
   */
  breakoutScore: number;
  /** How far into its move it already is. */
  stage: Stage;
  /**
   * Multiplier (0-1) applied to the raw score because the stock already ran.
   * 1 = no discount; 0.4 = a 60% "you're late" discount.
   */
  latenessMultiplier: number;
  /** The trailing run-up (max of 1Y / YTD) the discount is based on, percent. */
  runUp: number;
  /** Estimated window in which a re-rating could play out. */
  timeframe: Timeframe;
  /** Confidence in the timeframe/thesis, 0-100. */
  confidence: number;
  factors: FactorBreakdown[];
  /** One-line investment thesis. */
  thesis: string;
  /** Top reason strings, ordered by contribution. */
  topReasons: string[];
  /** Short cautionary note (the main risk/caveat for this name). */
  caveat: string;
}
