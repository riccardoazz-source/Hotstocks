import type { Stock, FactorKey } from "../types";
import { factorScores, priceVsFundamentals } from "../scoring";
import type { Sample } from "./types";

/**
 * Synthetic historical dataset generator.
 *
 * ⚠️ This is NOT real market data. It exists so the backtest harness runs
 * end-to-end offline and demonstrates that it can (a) measure whether the score
 * predicts forward returns and (b) recover sensible weights.
 *
 * Forward returns are generated from a hidden "true" model with deliberately
 * different weights from our defaults (some factors are near-useless here) plus
 * heavy noise — so calibration has something real to discover and we can see it
 * down-weight the useless factors. Real-world conclusions require real data
 * (see scripts/backtest.mts and the README).
 */

// Hidden "true" betas the synthetic world rewards (note: quality ≈ useless,
// growth small, forwardOutlook & roomToRun strong). Calibration should lean
// toward these and away from our hand-set defaults.
const TRUE_BETAS: Record<FactorKey, number> = {
  roomToRun: 0.3,
  forwardOutlook: 0.28,
  acceleration: 0.18,
  valuation: 0.12,
  underRadar: 0.07,
  growth: 0.05,
  quality: 0.0,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSamples(
  count = 1600,
  seed = 7
): { samples: Sample[]; trueBetas: Record<FactorKey, number> } {
  const r = mulberry32(seed);
  // Box-Muller normal.
  const norm = (mean: number, sd: number) => {
    const u = Math.max(1e-9, r());
    const v = r();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const clamp = (x: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, x));

  const samples: Sample[] = [];
  for (let i = 0; i < count; i++) {
    const revenueGrowthYoY = clamp(norm(20, 35), -30, 250);
    const revenueAcceleration = clamp(norm(0, 20), -60, 80);
    const earningsGrowthYoY = clamp(
      revenueGrowthYoY * (0.5 + r() * 2) + norm(0, 40),
      -90,
      400
    );
    const marketCap = Math.pow(10, 8.7 + r() * 3.6); // $500M – ~$2T
    const grossMargin = clamp(15 + r() * 70, 5, 95);
    const psRatio = clamp(0.5 + r() * 28, 0.3, 40);
    const priceChange1Y = clamp(
      revenueGrowthYoY * (0.5 + r() * 1.5) + norm(0, 60),
      -80,
      700
    );
    const priceChangeYTD = clamp(priceChange1Y * (0.3 + r() * 0.6) + norm(0, 20), -80, 600);
    const priceChange3M = clamp(priceChange1Y * 0.3 + norm(0, 15), -60, 200);
    const total = 3 + Math.floor(r() * 42);
    const analystBuy = Math.round(total * (0.3 + r() * 0.6));
    const analystSell = Math.round((total - analystBuy) * r() * 0.5);
    const analystHold = Math.max(0, total - analystBuy - analystSell);

    const features: Stock = {
      symbol: `SYN${i}`,
      name: `Synthetic ${i}`,
      sector: "Synthetic",
      price: 10 + r() * 200,
      marketCap,
      revenueGrowthYoY,
      earningsGrowthYoY,
      revenueAcceleration,
      grossMargin,
      priceChange3M,
      priceChange1Y,
      priceChangeYTD,
      rsi: clamp(50 + priceChange3M * 0.4, 20, 85),
      analystBuy,
      analystHold,
      analystSell,
      priceTargetUpside: norm(15, 25),
      forwardRevenueGrowth: clamp(revenueGrowthYoY * (0.4 + r() * 0.9), -30, 200),
      estimateRevisionTrend:
        revenueAcceleration > 8 ? 1 : revenueAcceleration < -8 ? -1 : 0,
      earningsSurpriseStreak: Math.floor(r() * 5),
      peRatio: earningsGrowthYoY > 0 ? 10 + r() * 110 : null,
      psRatio,
    };

    // Hidden "true" forward return: weighted factor scores × discount + noise.
    const scores = factorScores(features);
    const disc = priceVsFundamentals(features).multiplier;
    let driver = 0;
    (Object.keys(TRUE_BETAS) as FactorKey[]).forEach(
      (k) => (driver += TRUE_BETAS[k] * scores[k])
    );
    const effective = driver * disc; // 0..~100
    const forwardReturn = 0.6 * (effective - 50) + norm(0, 35);

    samples.push({
      date: `2020-${String((i % 12) + 1).padStart(2, "0")}`,
      symbol: features.symbol,
      features,
      forwardReturn,
    });
  }
  return { samples, trueBetas: TRUE_BETAS };
}
