import type { Stock, FactorKey } from "../types";

/** One historical observation: a stock's features at a date + what happened next. */
export interface Sample {
  date: string;
  symbol: string;
  /** The stock's feature snapshot as of `date`. */
  features: Stock;
  /** Realized forward price return after the holding window, in percent. */
  forwardReturn: number;
}

/** A sample reduced to what the evaluator needs (precomputed once). */
export interface PreparedSample {
  scores: Record<FactorKey, number>;
  /** Price-vs-fundamentals discount multiplier (weight-independent). */
  discount: number;
  forwardReturn: number;
}

export interface EvalResult {
  /** Number of samples. */
  n: number;
  /** Spearman rank correlation between score and forward return. */
  spearman: number;
  /** Top-quintile mean forward return minus bottom-quintile mean, in percent. */
  quintileSpread: number;
}
