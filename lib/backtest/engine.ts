import type { FactorKey, Weights } from "../types";
import {
  factorScores,
  priceVsFundamentals,
  composeScore,
  DEFAULT_WEIGHTS,
} from "../scoring";
import type { Sample, PreparedSample, EvalResult } from "./types";

const FACTOR_KEYS = Object.keys(DEFAULT_WEIGHTS) as FactorKey[];

/** Precompute per-sample factor scores + discount (independent of weights). */
export function prepare(samples: Sample[]): PreparedSample[] {
  return samples.map((s) => ({
    scores: factorScores(s.features),
    discount: priceVsFundamentals(s.features).multiplier,
    forwardReturn: s.forwardReturn,
  }));
}

/** Dense ranks (ties get average rank), used for Spearman. */
function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; // 1-based average rank
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let cov = 0,
    va = 0,
    vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

/** Evaluate a weight vector: how well does the score predict forward return? */
export function evaluate(
  prepared: PreparedSample[],
  weights: Weights
): EvalResult {
  const scores = prepared.map((p) =>
    composeScore(p.scores, weights, p.discount)
  );
  const returns = prepared.map((p) => p.forwardReturn);

  const spearman = pearson(ranks(scores), ranks(returns));

  // Quintile spread: average forward return of the top 20% by score minus the
  // bottom 20%. This is the practical "does the ranking pay?" metric.
  const order = scores
    .map((s, i) => [s, returns[i]] as const)
    .sort((a, b) => b[0] - a[0]);
  const q = Math.max(1, Math.floor(order.length / 5));
  const top = order.slice(0, q);
  const bottom = order.slice(-q);
  const avg = (arr: readonly (readonly [number, number])[]) =>
    arr.reduce((s, x) => s + x[1], 0) / arr.length;
  const quintileSpread = avg(top) - avg(bottom);

  return { n: prepared.length, spearman, quintileSpread };
}

function normalize(raw: number[]): Weights {
  const sum = raw.reduce((s, x) => s + x, 0) || 1;
  const w = {} as Weights;
  FACTOR_KEYS.forEach((k, i) => (w[k] = raw[i] / sum));
  return w;
}

/** Simple seeded PRNG (mulberry32) for reproducible searches. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random search over the weight simplex to maximize the quintile spread.
 * Returns the best weights found and their evaluation. Honest about being a
 * coarse optimizer — it finds a good vector, not a proven global optimum.
 */
export function calibrate(
  prepared: PreparedSample[],
  iterations = 6000,
  seed = 42
): { weights: Weights; result: EvalResult } {
  const rand = rng(seed);
  let best = DEFAULT_WEIGHTS;
  let bestResult = evaluate(prepared, DEFAULT_WEIGHTS);

  for (let it = 0; it < iterations; it++) {
    // Bias exploration toward the neighbourhood of the defaults half the time.
    const near = it % 2 === 0;
    const raw = FACTOR_KEYS.map((k) => {
      const base = near ? DEFAULT_WEIGHTS[k] : 0.02;
      return Math.max(0.001, base + (rand() - 0.5) * (near ? 0.18 : 0.4));
    });
    const w = normalize(raw);
    const r = evaluate(prepared, w);
    if (r.quintileSpread > bestResult.quintileSpread) {
      best = w;
      bestResult = r;
    }
  }
  return { weights: best, result: bestResult };
}

export { FACTOR_KEYS };
