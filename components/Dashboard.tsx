"use client";

import { useMemo, useState } from "react";
import type { ScoredStock } from "@/lib/types";
import { StockCard } from "./StockCard";

type CapBand = "all" | "under10" | "10to50" | "mega";

const CAP_BANDS: { id: CapBand; label: string }[] = [
  { id: "all", label: "All sizes" },
  { id: "under10", label: "< $10B" },
  { id: "10to50", label: "$10–50B" },
  { id: "mega", label: "> $200B" },
];

function inBand(cap: number, band: CapBand): boolean {
  switch (band) {
    case "under10":
      return cap < 1e10;
    case "10to50":
      return cap >= 1e10 && cap < 5e10;
    case "mega":
      return cap >= 2e11;
    default:
      return true;
  }
}

export function Dashboard({
  stocks,
  source,
  notice,
  generatedAt,
}: {
  stocks: ScoredStock[];
  source: "mock" | "fmp" | "yahoo" | "finnhub";
  notice?: string;
  generatedAt: string;
}) {
  const [query, setQuery] = useState("");
  const [band, setBand] = useState<CapBand>("all");
  const [earlyOnly, setEarlyOnly] = useState(false);
  const [showMethod, setShowMethod] = useState(false);

  const sectors = useMemo(
    () => Array.from(new Set(stocks.map((s) => s.sector))).sort(),
    [stocks]
  );
  const [sector, setSector] = useState<string>("all");

  const ranked = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stocks
      .filter((s) => inBand(s.marketCap, band))
      .filter((s) => sector === "all" || s.sector === sector)
      .filter(
        (s) =>
          !earlyOnly ||
          (s.stage !== "Running ahead" &&
            s.stage !== "Price ahead of fundamentals")
      )
      .filter(
        (s) =>
          !q ||
          s.symbol.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.sector.toLowerCase().includes(q)
      );
  }, [stocks, query, band, sector, earlyOnly]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:pt-14">
      <header className="mb-8">
        <div className="flex items-center gap-2">
          <span className="text-3xl">🔥</span>
          <h1 className="bg-gradient-to-r from-orange-400 to-amber-200 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
            Hotstocks
          </h1>
        </div>
        <p className="mt-2 max-w-xl text-white/60">
          One ranked list of stocks with the most room to{" "}
          <em>become</em> the next breakout — each with the reasons why and a
          model estimate of when it could re-rate.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full border px-2.5 py-1 ${
              source === "mock"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            }`}
          >
            {source === "fmp"
              ? "● Live data (FMP)"
              : source === "yahoo"
              ? "● Live data (Yahoo · free)"
              : source === "finnhub"
              ? "● Live data (Finnhub · free)"
              : "● Demo data"}
          </span>
          <span className="text-white/30">
            Updated {new Date(generatedAt).toLocaleString()}
          </span>
          <button
            onClick={() => setShowMethod((m) => !m)}
            className="rounded-full border border-white/10 px-2.5 py-1 text-white/50 transition hover:border-white/30 hover:text-white"
          >
            {showMethod ? "Hide method ▲" : "How the ranking works ▼"}
          </button>
        </div>

        {showMethod && (
          <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
            <p>
              The <strong>Breakout Score</strong> is forward-looking: it rewards
              what tends to precede a re-rating, not what already happened.
            </p>
            <ul className="ml-4 list-disc space-y-1 text-white/55">
              <li>
                <strong>Room to run (22%)</strong> — small/mid caps can multiply;
                mega-caps are penalized (a $3T name can&apos;t 10x).
              </li>
              <li>
                <strong>Forward outlook (18%)</strong> — next-year estimates,
                estimate revisions and earnings-surprise streak (leading
                indicators).
              </li>
              <li>
                <strong>Revenue growth (14%)</strong> &amp;{" "}
                <strong>acceleration (12%)</strong> — high and{" "}
                <em>speeding-up</em> growth.
              </li>
              <li>
                <strong>Valuation vs growth (16%)</strong> — growth not yet
                priced to perfection.
              </li>
              <li>
                <strong>Under the radar (10%)</strong> — lightly-covered gems;
                crowded consensus names are penalized.
              </li>
              <li>
                <strong>Margin quality (8%)</strong> — scalable gross margins.
              </li>
            </ul>
            <p className="border-t border-white/10 pt-2">
              Then a <strong>price-vs-fundamentals discount</strong> is applied:
              it compares how far the <em>price</em> has run against how much the{" "}
              <em>business</em> actually grew. A big mover whose earnings grew
              just as fast keeps its score; one whose price ran far ahead of the
              fundamentals is discounted as &quot;late&quot;. Each card&apos;s{" "}
              <strong>Stage</strong> badge (price lagging / in step / running
              ahead / ahead of fundamentals) shows where it sits — use{" "}
              <em>🚀 Early-stage only</em> to hide names whose price already ran
              ahead.
            </p>
          </div>
        )}

        {notice && (
          <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/80">
            {notice}
          </p>
        )}
      </header>

      <div className="mb-6 space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbol, name or sector…"
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm outline-none placeholder:text-white/30 focus:border-brand/50"
        />
        <div className="flex flex-wrap gap-2">
          {CAP_BANDS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBand(b.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                band === b.id
                  ? "bg-brand text-black"
                  : "border border-white/10 text-white/60 hover:text-white"
              }`}
            >
              {b.label}
            </button>
          ))}
          <button
            onClick={() => setEarlyOnly((v) => !v)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              earlyOnly
                ? "bg-emerald-500 text-black"
                : "border border-white/10 text-white/60 hover:text-white"
            }`}
            title="Hide names that have already run (Extended / Late stage)"
          >
            🚀 Early-stage only
          </button>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="ml-auto rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 outline-none focus:border-brand/50"
          >
            <option value="all">All sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {ranked.map((stock, i) => (
          <StockCard key={stock.symbol} stock={stock} rank={i + 1} />
        ))}
        {ranked.length === 0 && (
          <p className="py-12 text-center text-white/40">
            No matches for these filters.
          </p>
        )}
      </div>

      <footer className="mt-12 border-t border-white/10 pt-6 text-xs leading-relaxed text-white/40">
        <strong className="text-white/60">Not financial advice.</strong>{" "}
        Hotstocks is an educational, quantitative screener. Scores, timeframes
        and theses are model estimates derived from public fundamentals,
        valuation, growth and price data — not predictions or guarantees.
        Markets are uncertain; always do your own research.
      </footer>
    </main>
  );
}
