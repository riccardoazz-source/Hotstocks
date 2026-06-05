import type { Stock, ScoredStock, FactorBreakdown, Timeframe } from "./types";

/** Clamp a number into [min, max]. */
function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

/** Linear-scale a raw value from [lo, hi] onto a 0-100 score (clamped). */
function scale(value: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return clamp(((value - lo) / (hi - lo)) * 100);
}

/** Round to one decimal for display stability. */
function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Weights applied to each factor when computing overall hotness. Sum = 1. */
const WEIGHTS = {
  growth: 0.3,
  momentum: 0.25,
  analyst: 0.2,
  earlyStage: 0.15,
  valuation: 0.1,
} as const;

function billions(marketCap: number): number {
  return marketCap / 1e9;
}

/**
 * Early-stage score: smaller companies have more room to multiply ("the next
 * Nvidia"). A ~$1B cap scores ~100, a ~$3T mega-cap scores ~0.
 */
function earlyStageScore(marketCap: number): number {
  const logCap = Math.log10(Math.max(marketCap, 1e8));
  // $1B => log 9, $3T => log ~12.48
  return clamp(100 - ((logCap - 9) / (12.5 - 9)) * 100);
}

/**
 * Valuation sanity: we don't want "cheap", we want "not insane given growth".
 * A reasonable P/S relative to growth scores high; extreme froth is penalized.
 */
function valuationScore(s: Stock): number {
  // Growth-adjusted: P/S per point of revenue growth.
  const growth = Math.max(s.revenueGrowthYoY, 1);
  const psPerGrowth = s.psRatio / growth; // lower is better
  // 0.05 (great) -> 100 ; 0.6 (frothy) -> 0
  return scale(0.6 - psPerGrowth, 0, 0.55);
}

function buildFactors(s: Stock): FactorBreakdown[] {
  const totalAnalysts = s.analystBuy + s.analystHold + s.analystSell;
  const buyRatio = totalAnalysts > 0 ? s.analystBuy / totalAnalysts : 0;

  const growth = clamp(
    0.7 * scale(s.revenueGrowthYoY, 0, 80) +
      0.3 * scale(s.earningsGrowthYoY, -20, 120)
  );
  const momentum = clamp(
    0.55 * scale(s.priceChange3M, -25, 60) +
      0.3 * scale(s.priceChange1Y, -40, 200) +
      0.15 * scale(s.rsi, 40, 80)
  );
  const analyst = clamp(
    0.6 * scale(buyRatio * 100, 40, 100) +
      0.4 * scale(s.priceTargetUpside, -10, 80)
  );
  const early = earlyStageScore(s.marketCap);
  const valuation = valuationScore(s);

  const factors: FactorBreakdown[] = [
    {
      key: "growth",
      label: "Growth",
      score: r1(growth),
      weight: WEIGHTS.growth,
      reason: `Revenue ${s.revenueGrowthYoY >= 0 ? "+" : ""}${r1(
        s.revenueGrowthYoY
      )}% YoY, earnings ${s.earningsGrowthYoY >= 0 ? "+" : ""}${r1(
        s.earningsGrowthYoY
      )}% YoY`,
    },
    {
      key: "momentum",
      label: "Momentum",
      score: r1(momentum),
      weight: WEIGHTS.momentum,
      reason: `${s.priceChange3M >= 0 ? "Up" : "Down"} ${r1(
        Math.abs(s.priceChange3M)
      )}% in 3 months (RSI ${Math.round(s.rsi)})`,
    },
    {
      key: "analyst",
      label: "Analyst sentiment",
      score: r1(analyst),
      weight: WEIGHTS.analyst,
      reason: `${s.analystBuy}/${totalAnalysts} analysts rate Buy, ${
        s.priceTargetUpside >= 0 ? "+" : ""
      }${r1(s.priceTargetUpside)}% avg target upside`,
    },
    {
      key: "earlyStage",
      label: "Early-stage upside",
      score: r1(early),
      weight: WEIGHTS.earlyStage,
      reason:
        early > 55
          ? `Still ${
              billions(s.marketCap) < 10 ? "small" : "mid"
            }-cap ($${r1(billions(s.marketCap))}B) — lots of room to scale`
          : `Large-cap ($${r1(
              billions(s.marketCap)
            )}B) — already widely owned`,
    },
    {
      key: "valuation",
      label: "Valuation discipline",
      score: r1(valuation),
      weight: WEIGHTS.valuation,
      reason:
        valuation > 50
          ? `Valuation reasonable vs growth (P/S ${r1(s.psRatio)})`
          : `Rich valuation vs growth (P/S ${r1(s.psRatio)}) — priced for perfection`,
    },
  ];

  return factors;
}

function estimateTimeframe(
  momentum: number,
  analyst: number,
  rsi: number
): Timeframe {
  // Urgency: how soon a re-rating could realistically play out.
  const urgency = 0.5 * momentum + 0.35 * analyst + 0.15 * scale(rsi, 45, 75);
  if (urgency >= 68) return "0–3 months";
  if (urgency >= 45) return "3–9 months";
  return "9–24 months";
}

function estimateConfidence(s: Stock, factors: FactorBreakdown[]): number {
  const totalAnalysts = s.analystBuy + s.analystHold + s.analystSell;
  // More coverage + agreement + consistent signals => higher confidence.
  const coverage = scale(totalAnalysts, 3, 35);
  const agreement =
    totalAnalysts > 0 ? scale((s.analystBuy / totalAnalysts) * 100, 40, 95) : 0;
  const scores = factors.map((f) => f.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const consistency = clamp(100 - Math.sqrt(variance) * 1.8);
  return r1(clamp(0.4 * coverage + 0.35 * agreement + 0.25 * consistency));
}

/** Score a single stock, producing the full enriched record. */
export function scoreStock(s: Stock): ScoredStock {
  const factors = buildFactors(s);
  const byKey = Object.fromEntries(factors.map((f) => [f.key, f]));

  const hotness = r1(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  );

  const nextGenScore = r1(
    clamp(
      0.4 * byKey.growth.score +
        0.4 * byKey.earlyStage.score +
        0.2 * byKey.momentum.score
    )
  );

  const timeframe = estimateTimeframe(
    byKey.momentum.score,
    byKey.analyst.score,
    s.rsi
  );
  const confidence = estimateConfidence(s, factors);

  // Top reasons: factors ranked by their weighted contribution to hotness.
  const topReasons = [...factors]
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 3)
    .map((f) => f.reason);

  return {
    ...s,
    hotness,
    nextGenScore,
    timeframe,
    confidence,
    factors,
    topReasons,
  };
}

/** Score and sort a list of stocks by overall hotness (desc). */
export function scoreAll(stocks: Stock[]): ScoredStock[] {
  return stocks.map(scoreStock).sort((a, b) => b.hotness - a.hotness);
}
