import type {
  Stock,
  ScoredStock,
  FactorBreakdown,
  FactorKey,
  Timeframe,
  Stage,
  Weights,
} from "./types";

/**
 * Forward-looking scoring engine.
 *
 * Rewards the profile of a FUTURE breakout: small/mid caps (room to multiply),
 * a bright + improving forward outlook, accelerating growth, reasonable
 * valuation and under-covered names. It does NOT blindly penalize price
 * momentum — instead the raw score is discounted by how far price has run
 * AHEAD of fundamentals (price lagging the business = early; far ahead = late).
 *
 * Factor sub-scores and weights are exposed so the backtest can recombine and
 * calibrate them on historical data (see scripts/backtest.mts).
 */

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

function scale(value: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return clamp(((value - lo) / (hi - lo)) * 100);
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

function billions(marketCap: number): number {
  return marketCap / 1e9;
}

/** Default factor weights (sum = 1). The backtest can override these. */
export const DEFAULT_WEIGHTS: Weights = {
  roomToRun: 0.22,
  growth: 0.14,
  forwardOutlook: 0.18,
  acceleration: 0.12,
  valuation: 0.16,
  underRadar: 0.1,
  quality: 0.08,
};

export const FACTOR_LABELS: Record<FactorKey, string> = {
  roomToRun: "Room to run",
  growth: "Revenue growth",
  forwardOutlook: "Forward outlook",
  acceleration: "Growth acceleration",
  valuation: "Valuation vs growth",
  underRadar: "Under the radar",
  quality: "Margin quality",
};

// --- Individual factor sub-scores (0-100) ---

function roomToRunScore(marketCap: number): number {
  const logCap = Math.log10(Math.max(marketCap, 1e8));
  return clamp(100 - ((logCap - 9) / (12.5 - 9)) * 100);
}

function growthScore(s: Stock): number {
  return clamp(
    0.7 * scale(s.revenueGrowthYoY, 5, 60) +
      0.3 * scale(s.earningsGrowthYoY, -20, 100)
  );
}

function forwardOutlookScore(s: Stock): number {
  // Forward consensus revenue growth, with graceful fallback to a decayed
  // trailing rate when estimates aren't available.
  const fwdG = s.forwardRevenueGrowth ?? s.revenueGrowthYoY * 0.7;
  const base = scale(fwdG, 5, 50);
  const revAdj = s.estimateRevisionTrend === undefined ? 0 : s.estimateRevisionTrend * 12;
  const surprise =
    s.earningsSurpriseStreak === undefined
      ? 0
      : ((s.earningsSurpriseStreak / 4) * 100 - 50) * 0.2;
  return clamp(base + revAdj + surprise);
}

function accelerationScore(s: Stock): number {
  return scale(s.revenueAcceleration, -10, 30);
}

function valuationScore(s: Stock): number {
  const growth = Math.max(s.revenueGrowthYoY, 1);
  const psPerGrowth = s.psRatio / growth;
  return scale(0.6 - psPerGrowth, 0, 0.55);
}

function underRadarParts(s: Stock): { score: number; total: number } {
  const total = s.analystBuy + s.analystHold + s.analystSell;
  let coverage: number;
  if (total < 3) coverage = 45;
  else if (total <= 15) coverage = 100;
  else if (total <= 25) coverage = 100 - ((total - 15) / 10) * 30;
  else if (total <= 40) coverage = 70 - ((total - 25) / 15) * 35;
  else coverage = 28;
  const upside = scale(s.priceTargetUpside, -10, 60);
  return { score: clamp(0.55 * coverage + 0.45 * upside), total };
}

function qualityScore(s: Stock): number {
  return scale(s.grossMargin, 20, 80);
}

/** All seven factor sub-scores for a stock (0-100 each). */
export function factorScores(s: Stock): Record<FactorKey, number> {
  return {
    roomToRun: roomToRunScore(s.marketCap),
    growth: growthScore(s),
    forwardOutlook: forwardOutlookScore(s),
    acceleration: accelerationScore(s),
    valuation: valuationScore(s),
    underRadar: underRadarParts(s).score,
    quality: qualityScore(s),
  };
}

// --- Price-vs-fundamentals discount ---

function runUpOf(s: Stock): number {
  return Math.max(s.priceChange1Y, s.priceChangeYTD ?? s.priceChange1Y);
}

function fundamentalProgress(s: Stock): number {
  return (
    Math.max(s.revenueGrowthYoY, 0) + 0.5 * clamp(s.earningsGrowthYoY, 0, 200)
  );
}

function gapDiscount(gap: number): number {
  if (gap <= 40) return 1.0;
  if (gap <= 120) return 1.0 - ((gap - 40) / 80) * 0.15;
  if (gap <= 300) return 0.85 - ((gap - 120) / 180) * 0.25;
  if (gap <= 600) return 0.6 - ((gap - 300) / 300) * 0.15;
  return 0.45;
}

function stageOf(s: Stock, gap: number): Stage {
  const runUp = runUpOf(s);
  const fund = fundamentalProgress(s);
  if (s.revenueGrowthYoY < 5 && runUp < 10) return "Pre-breakout";
  if (gap < -20 && fund > 15) return "Price lagging growth";
  if (gap <= 40) return "In step with growth";
  if (gap <= 150) return "Running ahead";
  return "Price ahead of fundamentals";
}

/** The price-vs-fundamentals discount for a stock. Exposed for the backtest. */
export function priceVsFundamentals(s: Stock): {
  multiplier: number;
  gap: number;
  runUp: number;
  stage: Stage;
} {
  const runUp = runUpOf(s);
  const gap = r1(runUp - fundamentalProgress(s));
  return { multiplier: gapDiscount(gap), gap, runUp, stage: stageOf(s, gap) };
}

/** Combine factor scores + weights + discount into a final 0-100 score. */
export function composeScore(
  scores: Record<FactorKey, number>,
  weights: Weights,
  discount: number
): number {
  const raw = (Object.keys(weights) as FactorKey[]).reduce(
    (sum, k) => sum + scores[k] * weights[k],
    0
  );
  return raw * discount;
}

// --- Reasons, thesis, timeframe, confidence ---

function reasonFor(s: Stock, key: FactorKey): string {
  const capB = r1(billions(s.marketCap));
  const total = s.analystBuy + s.analystHold + s.analystSell;
  switch (key) {
    case "roomToRun":
      return roomToRunScore(s.marketCap) > 60
        ? `${capB < 10 ? "Small" : "Mid"}-cap ($${capB}B) — room to multiply`
        : `Large-cap ($${capB}B) — limited multiple-bagger upside`;
    case "growth":
      return `Revenue ${s.revenueGrowthYoY >= 0 ? "+" : ""}${r1(
        s.revenueGrowthYoY
      )}% YoY`;
    case "forwardOutlook": {
      const fwd = s.forwardRevenueGrowth;
      const rev =
        s.estimateRevisionTrend === undefined
          ? ""
          : s.estimateRevisionTrend > 0
          ? ", estimates being raised"
          : s.estimateRevisionTrend < 0
          ? ", estimates being cut"
          : "";
      return fwd !== undefined
        ? `Forward revenue est ${fwd >= 0 ? "+" : ""}${r1(fwd)}% next year${rev}`
        : `Forward outlook implied from current growth${rev}`;
    }
    case "acceleration":
      return s.revenueAcceleration >= 1
        ? `Growth accelerating (+${r1(s.revenueAcceleration)}pp vs prior year)`
        : s.revenueAcceleration <= -1
        ? `Growth decelerating (${r1(s.revenueAcceleration)}pp vs prior year)`
        : `Growth roughly steady year on year`;
    case "valuation":
      return valuationScore(s) > 50
        ? `Reasonably priced for its growth (P/S ${r1(s.psRatio)})`
        : `Richly valued vs growth (P/S ${r1(s.psRatio)})`;
    case "underRadar":
      return total <= 20
        ? `Lightly covered (${total} analysts) — room to be discovered`
        : `Heavily covered (${total} analysts) — already a consensus name`;
    case "quality":
      return `${r1(s.grossMargin)}% gross margin`;
  }
}

function buildFactors(s: Stock, weights: Weights): FactorBreakdown[] {
  const scores = factorScores(s);
  return (Object.keys(weights) as FactorKey[]).map((key) => ({
    key,
    label: FACTOR_LABELS[key],
    score: r1(scores[key]),
    weight: weights[key],
    reason: reasonFor(s, key),
  }));
}

function estimateTimeframe(
  accelScore: number,
  change3M: number,
  upside: number
): Timeframe {
  const momentum = scale(change3M, -20, 40);
  const urgency = 0.4 * accelScore + 0.3 * momentum + 0.3 * scale(upside, 0, 60);
  if (urgency >= 62) return "0–3 months";
  if (urgency >= 40) return "3–9 months";
  return "9–24 months";
}

function estimateConfidence(total: number, factors: FactorBreakdown[]): number {
  const coverage = scale(total, 3, 30);
  const scores = factors.map((f) => f.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const consistency = clamp(100 - Math.sqrt(variance) * 1.8);
  return r1(clamp(0.45 * coverage + 0.55 * consistency));
}

function buildThesis(s: Stock, stage: Stage): string {
  const capB = r1(billions(s.marketCap));
  const size =
    s.marketCap < 1e10 ? "small-cap" : s.marketCap < 5e10 ? "mid-cap" : "large-cap";
  const accel = s.revenueAcceleration >= 2 ? " and accelerating" : "";
  const stageNote =
    stage === "Price lagging growth"
      ? "price still lags the fundamentals — room to catch up"
      : stage === "In step with growth"
      ? "price tracking the fundamentals"
      : stage === "Running ahead"
      ? "price running ahead of the business — be selective"
      : stage === "Price ahead of fundamentals"
      ? "price has outrun the business — likely late"
      : "no clear trend yet";
  return `${size} ($${capB}B) growing revenue ${
    s.revenueGrowthYoY >= 0 ? "+" : ""
  }${r1(s.revenueGrowthYoY)}%${accel}; ${stageNote}.`;
}

function buildCaveat(s: Stock, gap: number): string {
  if (gap > 300)
    return `Price has run ~${Math.round(
      gap
    )}pp ahead of fundamental growth — speculative; chasing it is risky.`;
  if (gap > 120)
    return "Price is running ahead of the business — mind entry timing.";
  if (s.marketCap > 2e11)
    return "Mega-cap: a true multi-bagger from here is mathematically unlikely.";
  if (s.peRatio === null)
    return "Not yet profitable — depends on the growth story playing out.";
  if (s.revenueAcceleration <= -3)
    return "Growth is decelerating — watch for a further slowdown.";
  return "Smaller, higher-volatility name — size positions accordingly.";
}

/** Score a single stock (optionally with calibrated weights). */
export function scoreStock(s: Stock, weights: Weights = DEFAULT_WEIGHTS): ScoredStock {
  const factors = buildFactors(s, weights);
  const byKey = Object.fromEntries(factors.map((f) => [f.key, f]));
  const scores = factorScores(s);

  const { multiplier, gap, runUp, stage } = priceVsFundamentals(s);
  const breakoutScore = r1(composeScore(scores, weights, multiplier));

  const total = s.analystBuy + s.analystHold + s.analystSell;
  const timeframe = estimateTimeframe(
    byKey.acceleration.score,
    s.priceChange3M,
    s.priceTargetUpside
  );
  const confidence = estimateConfidence(total, factors);

  const topReasons = [...factors]
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 3)
    .map((f) => f.reason);

  return {
    ...s,
    breakoutScore,
    stage,
    latenessMultiplier: multiplier,
    runUp,
    fundamentalsGap: gap,
    timeframe,
    confidence,
    factors,
    topReasons,
    thesis: buildThesis(s, stage),
    caveat: buildCaveat(s, gap),
  };
}

/** Score and sort a list of stocks by Breakout score (desc). */
export function scoreAll(
  stocks: Stock[],
  weights: Weights = DEFAULT_WEIGHTS
): ScoredStock[] {
  return stocks
    .map((s) => scoreStock(s, weights))
    .sort((a, b) => b.breakoutScore - a.breakoutScore);
}
