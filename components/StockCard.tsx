"use client";

import { useState } from "react";
import type { ScoredStock } from "@/lib/types";
import { fmtMarketCap, fmtPct, fmtPrice } from "@/lib/format";
import { ScoreBar } from "./ScoreBar";
import { ScoreRing } from "./ScoreRing";

const TIMEFRAME_STYLES: Record<string, string> = {
  "0–3 months": "bg-rose-500/15 text-rose-300 border-rose-500/30",
  "3–9 months": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "9–24 months": "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

const STAGE_STYLES: Record<string, string> = {
  "Pre-breakout": "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "Early uptrend": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "Mid-trend": "bg-lime-500/15 text-lime-300 border-lime-500/30",
  Extended: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Late · already ran": "bg-rose-500/20 text-rose-300 border-rose-500/40",
};

export function StockCard({
  stock,
  rank,
}: {
  stock: ScoredStock;
  rank: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] transition hover:border-white/25">
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-bold text-white/30">#{rank}</span>
            <ScoreRing value={stock.breakoutScore} label="Breakout score" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold tracking-tight">
                {stock.symbol}
              </span>
              <span className="truncate text-sm text-white/50">
                {stock.name}
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-white/45">
              <span
                className={`rounded-full border px-2 py-0.5 font-medium ${
                  STAGE_STYLES[stock.stage]
                }`}
                title="Where the stock is in its move"
              >
                {stock.stage}
              </span>
              <span className="rounded-full border border-white/10 px-2 py-0.5">
                {stock.sector}
              </span>
              <span>{fmtPrice(stock.price)}</span>
              <span>{fmtMarketCap(stock.marketCap)}</span>
              <span
                className={
                  stock.runUp >= 0 ? "text-emerald-400/80" : "text-rose-400/80"
                }
              >
                {fmtPct(stock.runUp)} run-up
              </span>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-white/75">
              {stock.thesis}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              TIMEFRAME_STYLES[stock.timeframe]
            }`}
          >
            ⏱ Est. window: {stock.timeframe}
          </span>
          <div className="flex items-center gap-2 text-xs text-white/45">
            <span>Confidence</span>
            <div className="h-1.5 w-20 rounded-full bg-white/10">
              <div
                className="h-1.5 rounded-full bg-white/50"
                style={{ width: `${stock.confidence}%` }}
              />
            </div>
            <span className="tabular-nums">
              {stock.confidence.toFixed(0)}%
            </span>
          </div>
          <button
            onClick={() => setOpen((o) => !o)}
            className="ml-auto rounded-lg border border-white/10 px-3 py-1 text-xs text-white/60 transition hover:border-white/30 hover:text-white"
          >
            {open ? "Hide details ▲" : "Why & breakdown ▼"}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-black/20 p-5">
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
              Why it ranks here
            </h4>
            <ul className="space-y-1.5">
              {stock.topReasons.map((reason, i) => (
                <li key={i} className="flex gap-2 text-sm text-white/75">
                  <span className="text-brand">▸</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mb-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
              Factor breakdown
            </h4>
            <div className="space-y-2">
              {stock.factors.map((f) => (
                <div key={f.key} className="flex items-center gap-3">
                  <span
                    className="w-32 shrink-0 truncate text-xs text-white/50"
                    title={f.reason}
                  >
                    {f.label}
                  </span>
                  <ScoreBar value={f.score} />
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-white/50">
                    {f.score.toFixed(0)}
                  </span>
                  <span className="hidden w-10 shrink-0 text-right text-[10px] tabular-nums text-white/25 sm:block">
                    {Math.round(f.weight * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {stock.latenessMultiplier < 0.99 && (
            <div className="mb-3 flex items-center justify-between rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-200/80">
              <span>
                Late-stage discount (already up {stock.runUp.toFixed(0)}%)
              </span>
              <span className="font-semibold tabular-nums">
                −{Math.round((1 - stock.latenessMultiplier) * 100)}% to score
              </span>
            </div>
          )}

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
            ⚠ {stock.caveat}
          </div>
        </div>
      )}
    </div>
  );
}
