/** Small display helpers shared across the UI. */

export function fmtMarketCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

export function fmtPct(v: number, withSign = true): string {
  const sign = withSign && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

export function fmtPrice(v: number): string {
  return `$${v.toFixed(2)}`;
}

/** Map a 0-100 score to a tailwind text colour. */
export function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-400";
  if (score >= 55) return "text-lime-400";
  if (score >= 40) return "text-amber-400";
  return "text-rose-400";
}

/** Map a 0-100 score to a tailwind background (for bars/badges). */
export function scoreBg(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 55) return "bg-lime-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-rose-500";
}
