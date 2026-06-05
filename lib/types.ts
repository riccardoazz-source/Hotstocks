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

  // --- Forward-looking signals (the real leading indicators) ---
  /** Next fiscal year consensus revenue growth, in percent. */
  forwardRevenueGrowth?: number;
  /**
   * Direction analysts are revising forward estimates: +1 raising, 0 flat,
   * -1 cutting. Rising estimates often precede a re-rating.
   */
  estimateRevisionTrend?: number;
  /** How many of the last 4 quarters beat EPS expectations (0-4). */
  earningsSurpriseStreak?: number;

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
  | "forwardOutlook"
  | "acceleration"
  | "valuation"
  | "underRadar"
  | "quality";

/** Tunable factor weights (sum should be 1). Calibrated by the backtest. */
export type Weights = Record<FactorKey, number>;

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
 * Where a stock is relative to its own fundamentals. The app is about finding
 * names whose price has NOT yet outrun the business — so this compares price
 * run-up against actual fundamental growth, not price alone. A name can be up a
 * lot and still be "early" if earnings grew even more.
 */
export type Stage =
  | "Pre-breakout"
  | "Price lagging growth"
  | "In step with growth"
  | "Running ahead"
  | "Price ahead of fundamentals";

/** A stock enriched with computed scores and explanations. */
export interface ScoredStock extends Stock {
  /**
   * Overall 0-100 forward-looking score: how much room + reason this name has
   * to *become* a breakout from here (not how much it already ran).
   */
  breakoutScore: number;
  /** Where price sits relative to fundamental growth. */
  stage: Stage;
  /**
   * Multiplier (0-1) applied to the raw score when price has outrun the
   * business. 1 = price justified by fundamentals; 0.45 = price far ahead.
   */
  latenessMultiplier: number;
  /** The trailing run-up (max of 1Y / YTD), percent. */
  runUp: number;
  /**
   * Price run-up minus fundamental growth, in percentage points. Positive =
   * price ahead of the business (riskier); negative = price still lagging.
   */
  fundamentalsGap: number;
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
