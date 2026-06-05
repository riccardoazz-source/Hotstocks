"use client";

import { useMemo, useState } from "react";
import type { ScoredStock } from "@/lib/types";
import { StockCard } from "./StockCard";

type Tab = "discovery" | "when" | "why";

const TABS: { id: Tab; label: string; blurb: string }[] = [
  {
    id: "discovery",
    label: "🔎 Discovery",
    blurb:
      "Find the next Nvidia: early-stage names with high growth and room to scale.",
  },
  {
    id: "when",
    label: "⏱ Rank · When",
    blurb:
      "Best hotstocks ordered by how soon a re-rating could realistically play out.",
  },
  {
    id: "why",
    label: "💡 Rank · Why",
    blurb: "Best hotstocks ordered by overall conviction, with the reasons why.",
  },
];

const TIMEFRAME_ORDER: Record<string, number> = {
  "0–3 months": 0,
  "3–9 months": 1,
  "9–24 months": 2,
};

export function Dashboard({
  stocks,
  source,
  notice,
  generatedAt,
}: {
  stocks: ScoredStock[];
  source: "mock" | "fmp";
  notice?: string;
  generatedAt: string;
}) {
  const [tab, setTab] = useState<Tab>("why");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stocks;
    return stocks.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.sector.toLowerCase().includes(q)
    );
  }, [stocks, query]);

  const ranked = useMemo(() => {
    const list = [...filtered];
    if (tab === "discovery") {
      // Early-stage upside first; mega-caps drop down the list.
      return list
        .filter((s) => s.marketCap < 5e11)
        .sort((a, b) => b.nextGenScore - a.nextGenScore);
    }
    if (tab === "when") {
      return list.sort((a, b) => {
        const t = TIMEFRAME_ORDER[a.timeframe] - TIMEFRAME_ORDER[b.timeframe];
        if (t !== 0) return t;
        // within the same window, hotter + more confident first
        return (
          b.hotness * (b.confidence / 100) - a.hotness * (a.confidence / 100)
        );
      });
    }
    return list.sort((a, b) => b.hotness - a.hotness);
  }, [filtered, tab]);

  const active = TABS.find((t) => t.id === tab)!;
  const primaryMetric = tab === "discovery" ? "nextGenScore" : "hotness";

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:pt-16">
      <header className="mb-8">
        <div className="flex items-center gap-2">
          <span className="text-3xl">🔥</span>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Hotstocks
          </h1>
        </div>
        <p className="mt-2 max-w-xl text-white/60">
          A quantitative screener that ranks high-potential stocks, explains{" "}
          <em>why</em>, and estimates roughly <em>when</em> a re-rating could
          play out.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full border px-2.5 py-1 ${
              source === "fmp"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-300"
            }`}
          >
            {source === "fmp" ? "● Live data (FMP)" : "● Demo data"}
          </span>
          <span className="text-white/30">
            Updated {new Date(generatedAt).toLocaleString()}
          </span>
        </div>
        {notice && (
          <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
            {notice}
          </p>
        )}
      </header>

      <nav className="sticky top-2 z-10 mb-4 flex gap-1 rounded-2xl border border-white/10 bg-black/40 p-1 backdrop-blur">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "bg-brand text-black"
                : "text-white/60 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <p className="mb-4 text-sm text-white/50">{active.blurb}</p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search symbol, name or sector…"
        className="mb-6 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm outline-none placeholder:text-white/30 focus:border-brand/50"
      />

      <div className="space-y-4">
        {ranked.map((stock, i) => (
          <StockCard
            key={stock.symbol}
            stock={stock}
            rank={i + 1}
            primaryMetric={primaryMetric}
          />
        ))}
        {ranked.length === 0 && (
          <p className="py-12 text-center text-white/40">
            No matches. Try another search.
          </p>
        )}
      </div>

      <footer className="mt-12 border-t border-white/10 pt-6 text-xs leading-relaxed text-white/40">
        <strong className="text-white/60">Not financial advice.</strong>{" "}
        Hotstocks is an educational, quantitative screener. Scores and timeframes
        are model estimates derived from growth, momentum, analyst sentiment and
        valuation — not predictions or guarantees. Always do your own research.
      </footer>
    </main>
  );
}
