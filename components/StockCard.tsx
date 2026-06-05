import type { ScoredStock } from "@/lib/types";
import {
  fmtMarketCap,
  fmtPct,
  fmtPrice,
  scoreColor,
} from "@/lib/format";
import { ScoreBar } from "./ScoreBar";

const TIMEFRAME_STYLES: Record<string, string> = {
  "0–3 months": "bg-rose-500/15 text-rose-300 border-rose-500/30",
  "3–9 months": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "9–24 months": "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

export function StockCard({
  stock,
  rank,
  primaryMetric,
}: {
  stock: ScoredStock;
  rank: number;
  /** Which headline number to feature for this view. */
  primaryMetric: "hotness" | "nextGenScore";
}) {
  const headline =
    primaryMetric === "hotness" ? stock.hotness : stock.nextGenScore;
  const headlineLabel =
    primaryMetric === "hotness" ? "Hotness" : "Next-gen score";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white/70">
            {rank}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight">
                {stock.symbol}
              </span>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/50">
                {stock.sector}
              </span>
            </div>
            <div className="text-sm text-white/50">{stock.name}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-extrabold ${scoreColor(headline)}`}>
            {headline.toFixed(0)}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-white/40">
            {headlineLabel}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="text-white/70">{fmtPrice(stock.price)}</span>
        <span className="text-white/40">{fmtMarketCap(stock.marketCap)}</span>
        <span
          className={
            stock.priceChange1Y >= 0 ? "text-emerald-400" : "text-rose-400"
          }
        >
          {fmtPct(stock.priceChange1Y)} 1Y
        </span>
        <span
          className={`ml-auto rounded-full border px-2.5 py-1 text-xs font-medium ${
            TIMEFRAME_STYLES[stock.timeframe]
          }`}
        >
          ⏱ {stock.timeframe}
        </span>
      </div>

      <ul className="mt-4 space-y-1.5">
        {stock.topReasons.map((reason, i) => (
          <li key={i} className="flex gap-2 text-sm text-white/70">
            <span className="text-brand">▸</span>
            <span>{reason}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-2">
        {stock.factors.map((f) => (
          <div key={f.key} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-xs text-white/40">
              {f.label}
            </span>
            <ScoreBar value={f.score} />
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-white/50">
              {f.score.toFixed(0)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-white/40">
        <span>Confidence</span>
        <div className="h-1.5 w-24 rounded-full bg-white/10">
          <div
            className="h-1.5 rounded-full bg-white/50"
            style={{ width: `${stock.confidence}%` }}
          />
        </div>
        <span className="tabular-nums">{stock.confidence.toFixed(0)}%</span>
      </div>
    </div>
  );
}
