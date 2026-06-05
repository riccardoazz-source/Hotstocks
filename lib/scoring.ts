import type {
  Stock,
  ScoredStock,
  FactorBreakdown,
  FactorKey,
  Timeframe,
} from "./types";

/**
 * Forward-looking scoring engine.
 *
 * The goal is to surface stocks that could *become* breakouts from here — not
 * the ones that already ran. So the model deliberately:
 *   - rewards small/mid caps (room to multiply) and penalizes mega caps;
 *   - rewards accelerating growth (a leading indicator), not just past growth;
 *   - rewards under-covered "undiscovered" names and penalizes crowded consensus;
 *   - treats price momentum as "Goldilocks": a healthy early uptrend is good,
 *     a parabolic +200% run is a red flag ("you're late"), a crash is bad.
 */

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

/** Linear-scale a raw value from [lo, hi] onto a 0-100 score (clamped). */
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

/** Weights for the final Breakout score. Sum = 1. */
const WEIGHTS: Record<FactorKey, number> = {
  roomToRun: 0.26,
  growth: 0.2,
  acceleration: 0.12,
  valuation: 0.16,
  underRadar: 0.12,
  momentum: 0.1,
  quality: 0.04,
};

/** Smaller cap => more room to multiply. ~$1B ≈ 100, ~$3T ≈ 0. */
function roomToRunScore(marketCap: number): number {
  const logCap = Math.log10(Math.max(marketCap, 1e8));
  return clamp(100 - ((logCap - 9) / (12.5 - 9)) * 100);
}

/**
 * "Goldilocks" momentum: best for a healthy emerging uptrend; penalizes both
 * falling knives and parabolic moves where most of the gain already happened.
 */
function momentumScore(change1Y: number, change3M: number): number {
  let base: number;
  if (change1Y <= -40) base = 8;
  else if (change1Y <= 0) base = 8 + ((change1Y + 40) / 40) * 47; // -> 55
  else if (change1Y <= 50) base = 55 + (change1Y / 50) * 45; // -> 100 (sweet spot)
  else if (change1Y <= 120) base = 100 - ((change1Y - 50) / 70) * 30; // -> 70
  else if (change1Y <= 250) base = 70 - ((change1Y - 120) / 130) * 45; // -> 25
  else base = 18; // very parabolic: you're late
  // small freshness nudge from recent 3M action
  const fresh = scale(change3M, -20, 30) - 50; // -50..+50
  return clamp(base + fresh * 0.12);
}

/** Valuation relative to growth (PEG-like): cheap growth scores high. */
function valuationScore(s: Stock): number {
  const growth = Math.max(s.revenueGrowthYoY, 1);
  const psPerGrowth = s.psRatio / growth; // lower is better
  return scale(0.6 - psPerGrowth, 0, 0.55);
}

/**
 * Under-the-radar: undiscovered names (light analyst coverage) with upside
 * score best; heavily-covered consensus names (40+ analysts) are penalized.
 */
function underRadarScore(s: Stock): { score: number; total: number } {
  const total = s.analystBuy + s.analystHold + s.analystSell;
  let coverage: number;
  if (total < 3) coverage = 45; // too obscure / illiquid risk
  else if (total <= 15) coverage = 100;
  else if (total <= 25) coverage = 100 - ((total - 15) / 10) * 30; // ->70
  else if (total <= 40) coverage = 70 - ((total - 25) / 15) * 35; // ->35
  else coverage = 28; // crowded consensus
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
  const momentum = momentumScore(s.priceChange1Y, s.priceChange3M);
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
          ? `Lightly covered (${total} analysts), ${
              s.priceTargetUpside >= 0 ? "+" : ""
            }${r1(s.priceTargetUpside)}% target upside — room to be discovered`
          : `Heavily covered (${total} analysts) — already a consensus name`,
    },
    {
      key: "momentum",
      label: "Momentum stage",
      score: r1(momentum),
      weight: WEIGHTS.momentum,
      reason:
        s.priceChange1Y > 150
          ? `Up ${r1(s.priceChange1Y)}% in 1Y — much of the move may be done`
          : s.priceChange1Y < -25
          ? `Down ${r1(Math.abs(s.priceChange1Y))}% in 1Y — no uptrend yet`
          : `Healthy ${s.priceChange1Y >= 0 ? "up" : "down"}trend (${
              s.priceChange1Y >= 0 ? "+" : ""
            }${r1(s.priceChange1Y)}% 1Y)`,
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

function estimateTimeframe(
  accelScore: number,
  momentum: number,
  upside: number
): Timeframe {
  const urgency = 0.4 * accelScore + 0.3 * momentum + 0.3 * scale(upside, 0, 60);
  if (urgency >= 62) return "0–3 months";
  if (urgency >= 40) return "3–9 months";
  return "9–24 months";
}

function estimateConfidence(
  total: number,
  factors: FactorBreakdown[]
): number {
  const coverage = scale(total, 3, 30);
  const scores = factors.map((f) => f.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const consistency = clamp(100 - Math.sqrt(variance) * 1.8);
  return r1(clamp(0.45 * coverage + 0.55 * consistency));
}

function buildThesis(s: Stock, factors: FactorBreakdown[]): string {
  const capB = r1(billions(s.marketCap));
  const size = s.marketCap < 1e10 ? "small-cap" : s.marketCap < 5e10 ? "mid-cap" : "large-cap";
  const accel =
    s.revenueAcceleration >= 2 ? " and accelerating" : "";
  const cover =
    s.analystBuy + s.analystHold + s.analystSell <= 18
      ? ", still under-covered"
      : "";
  return `${size} ($${capB}B) growing revenue ${
    s.revenueGrowthYoY >= 0 ? "+" : ""
  }${r1(s.revenueGrowthYoY)}%${accel}${cover} — ${
    factors.find((f) => f.key === "valuation")!.score > 50
      ? "priced with room to re-rate"
      : "the question is whether growth justifies the valuation"
  }.`;
}

function buildCaveat(s: Stock): string {
  if (s.priceChange1Y > 150)
    return "Already up sharply — entry timing and pullback risk matter.";
  if (s.marketCap > 2e11)
    return "Mega-cap: a true multi-bagger from here is mathematically unlikely.";
  if (s.psRatio / Math.max(s.revenueGrowthYoY, 1) > 0.45)
    return "Rich valuation leaves little margin for execution slips.";
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

  const breakoutScore = r1(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  );

  const timeframe = estimateTimeframe(
    byKey.acceleration.score,
    byKey.momentum.score,
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
    timeframe,
    confidence,
    factors,
    topReasons,
    thesis: buildThesis(s, factors),
    caveat: buildCaveat(s),
  };
}

/** Score and sort a list of stocks by Breakout score (desc). */
export function scoreAll(stocks: Stock[]): ScoredStock[] {
  return stocks.map(scoreStock).sort((a, b) => b.breakoutScore - a.breakoutScore);
}
