import type {
  Stock,
  ScoredStock,
  FactorBreakdown,
  FactorKey,
  Timeframe,
  Stage,
} from "./types";

/**
 * Forward-looking scoring engine.
 *
 * Goal: surface stocks that could *become* breakouts from here — not the ones
 * that already ran. The model rewards small/mid caps (room to multiply),
 * accelerating growth, reasonable valuation and under-covered names.
 *
 * Crucially, it does NOT blindly penalize price momentum. A stock can be up a
 * lot and still be early if the BUSINESS grew even more. So instead of a pure
 * price penalty, the final score is discounted by how far price has run *ahead
 * of fundamentals* — the "price vs fundamentals gap". Price lagging the
 * business = cheap/early; price far ahead = speculative/late.
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

/** Weights for the raw (pre-discount) Breakout score. Sum = 1. */
const WEIGHTS: Record<Exclude<FactorKey, "momentum">, number> = {
  roomToRun: 0.26,
  growth: 0.2,
  acceleration: 0.14,
  valuation: 0.18,
  underRadar: 0.14,
  quality: 0.08,
};

/** Smaller cap => more room to multiply. ~$1B ≈ 100, ~$3T ≈ 0. */
function roomToRunScore(marketCap: number): number {
  const logCap = Math.log10(Math.max(marketCap, 1e8));
  return clamp(100 - ((logCap - 9) / (12.5 - 9)) * 100);
}

/** Valuation relative to growth (PEG-like): cheap growth scores high. */
function valuationScore(s: Stock): number {
  const growth = Math.max(s.revenueGrowthYoY, 1);
  const psPerGrowth = s.psRatio / growth; // lower is better
  return scale(0.6 - psPerGrowth, 0, 0.55);
}

/**
 * Under-the-radar: lightly-covered names with upside score best; heavily
 * covered consensus names (40+ analysts) are penalized.
 */
function underRadarScore(s: Stock): { score: number; total: number } {
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

function buildFactors(s: Stock): { factors: FactorBreakdown[]; total: number } {
  const room = roomToRunScore(s.marketCap);
  const growth = clamp(
    0.7 * scale(s.revenueGrowthYoY, 5, 60) +
      0.3 * scale(s.earningsGrowthYoY, -20, 100)
  );
  const acceleration = scale(s.revenueAcceleration, -10, 30);
  const valuation = valuationScore(s);
  const { score: underRadar, total } = underRadarScore(s);
  const quality = scale(s.grossMargin, 20, 80);

  const capB = r1(billions(s.marketCap));

  const factors: FactorBreakdown[] = [
    {
      key: "roomToRun",
      label: "Room to run",
      score: r1(room),
      weight: WEIGHTS.roomToRun,
      reason:
        room > 60
          ? `${capB < 10 ? "Small" : "Mid"}-cap ($${capB}B) — room to multiply`
          : `Large-cap ($${capB}B) — limited multiple-bagger upside`,
    },
    {
      key: "growth",
      label: "Revenue growth",
      score: r1(growth),
      weight: WEIGHTS.growth,
      reason: `Revenue ${s.revenueGrowthYoY >= 0 ? "+" : ""}${r1(
        s.revenueGrowthYoY
      )}% YoY`,
    },
    {
      key: "acceleration",
      label: "Growth acceleration",
      score: r1(acceleration),
      weight: WEIGHTS.acceleration,
      reason:
        s.revenueAcceleration >= 1
          ? `Growth accelerating (+${r1(
              s.revenueAcceleration
            )}pp vs prior year)`
          : s.revenueAcceleration <= -1
          ? `Growth decelerating (${r1(s.revenueAcceleration)}pp vs prior year)`
          : `Growth roughly steady year on year`,
    },
    {
      key: "valuation",
      label: "Valuation vs growth",
      score: r1(valuation),
      weight: WEIGHTS.valuation,
      reason:
        valuation > 50
          ? `Reasonably priced for its growth (P/S ${r1(s.psRatio)})`
          : `Richly valued vs growth (P/S ${r1(s.psRatio)})`,
    },
    {
      key: "underRadar",
      label: "Under the radar",
      score: r1(underRadar),
      weight: WEIGHTS.underRadar,
      reason:
        total <= 20
          ? `Lightly covered (${total} analysts) — room to be discovered`
          : `Heavily covered (${total} analysts) — already a consensus name`,
    },
    {
      key: "quality",
      label: "Margin quality",
      score: r1(quality),
      weight: WEIGHTS.quality,
      reason: `${r1(s.grossMargin)}% gross margin`,
    },
  ];

  return { factors, total };
}

/** The trailing run-up: the larger of 1Y and YTD price change. */
function runUpOf(s: Stock): number {
  return Math.max(s.priceChange1Y, s.priceChangeYTD ?? s.priceChange1Y);
}

/** How much the business itself grew recently (revenue + part of earnings). */
function fundamentalProgress(s: Stock): number {
  return (
    Math.max(s.revenueGrowthYoY, 0) + 0.5 * clamp(s.earningsGrowthYoY, 0, 200)
  );
}

/**
 * Discount applied when price has outrun the business. Driven by the gap
 * (price run-up minus fundamental growth), NOT by price alone — so a strong
 * mover whose fundamentals grew just as fast keeps most of its score.
 */
function gapDiscount(gap: number): number {
  if (gap <= 40) return 1.0;
  if (gap <= 120) return 1.0 - ((gap - 40) / 80) * 0.15; // -> 0.85
  if (gap <= 300) return 0.85 - ((gap - 120) / 180) * 0.25; // -> 0.60
  if (gap <= 600) return 0.6 - ((gap - 300) / 300) * 0.15; // -> 0.45
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

/** Score a single stock. */
export function scoreStock(s: Stock): ScoredStock {
  const { factors, total } = buildFactors(s);
  const byKey = Object.fromEntries(factors.map((f) => [f.key, f]));

  const rawScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

  const runUp = runUpOf(s);
  const fundamentalsGap = r1(runUp - fundamentalProgress(s));
  const lateness = gapDiscount(fundamentalsGap);
  const stage = stageOf(s, fundamentalsGap);
  const breakoutScore = r1(rawScore * lateness);

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
    latenessMultiplier: lateness,
    runUp,
    fundamentalsGap,
    timeframe,
    confidence,
    factors,
    topReasons,
    thesis: buildThesis(s, stage),
    caveat: buildCaveat(s, fundamentalsGap),
  };
}

/** Score and sort a list of stocks by Breakout score (desc). */
export function scoreAll(stocks: Stock[]): ScoredStock[] {
  return stocks
    .map(scoreStock)
    .sort((a, b) => b.breakoutScore - a.breakoutScore);
}
