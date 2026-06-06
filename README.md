# 🔥 Hotstocks

A quantitative stock screener that surfaces the stocks with the most room to
*become* the next breakout — one ranked list, each name with the reasons **why**
and a model estimate of **when** a re-rating could play out. Built with Next.js
and designed to deploy on Vercel in one click.

> **Not financial advice.** Hotstocks is an educational tool. Its scores,
> timeframes and theses are model estimates derived from public fundamentals,
> valuation, growth and price data — not predictions or guarantees.

## What it does

A single **Breakout Score** ranking. For every stock it shows the headline
score, a one-line thesis, an estimated re-rating window (`0–3` / `3–9` /
`9–24 months`) with a confidence meter, the top reasons it ranks where it does,
the full factor breakdown, and the main caveat/risk. Filter by market-cap band
or sector; search by symbol/name.

## How the scoring works — the method

The score is **forward-looking by design**: it rewards what tends to *precede* a
re-rating, not what already happened. A naive screener ranks the names that
already ran (mega-caps, parabolic momentum); this one deliberately does the
opposite. See `lib/scoring.ts`.

| Factor | Weight | What it rewards |
| --- | --- | --- |
| **Room to run** | 26% | Small/mid caps that can still multiply; mega-caps penalized (a $3T name can't 10x) |
| **Revenue growth** | 20% | High revenue (and earnings) growth |
| **Growth acceleration** | 14% | Growth that is *speeding up* year over year — a leading indicator |
| **Valuation vs growth** | 18% | Growth not yet priced to perfection (PEG-like) |
| **Under the radar** | 14% | Lightly-covered names; crowded consensus (40+ analysts) penalized |
| **Margin quality** | 8% | Scalable gross margins |

**Then the key step — the price-vs-fundamentals discount.** Rather than
penalizing price momentum outright (a strong mover can still have room), the raw
score is multiplied by a discount based on the **gap between how far the price
ran and how much the business actually grew**:

- Price up 150% but earnings up 300% → price *lags* the business → **no
  discount**, it's still early (even though it already moved a lot).
- Price up 565% but revenue up 40% → price ran far *ahead* of the business →
  **heavy discount**, likely late.

Each stock gets a **Stage** label from this gap — *Price lagging growth → In
step → Running ahead → Price ahead of fundamentals* — surfaced on every card,
with a `🚀 Early-stage only` filter. `timeframe` comes from acceleration +
recent momentum; `confidence` from coverage and signal consistency. All weights
and thresholds live in `lib/scoring.ts`.

> **Why this matters:** this distinguishes *momentum with real fuel* (price
> tracking or lagging fundamentals) from *momentum already spent* (price far
> ahead of fundamentals). A famous mega-cap whose price merely kept pace with
> its earnings isn't punished for momentum — it ranks low because of its size
> (limited room to multiply), which is the honest reason.

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

Out of the box it runs on **bundled demo data** (`lib/data/mockStocks.ts`) so it
works with zero setup.

## Use live market data (free options)

Set `DATA_PROVIDER` in `.env.local` (or in Vercel env vars). You are **not** tied
to one vendor:

| `DATA_PROVIDER` | Key? | Notes |
| --- | --- | --- |
| `auto` ⭐ | optional | **Recommended.** Tries Yahoo → Finnhub → demo, for a free + robust app |
| `yahoo` | no | Free, rich data, no key. Unofficial — can be rate-limited from cloud IPs |
| `finnhub` | yes (free) | Official & reliable, 60 req/min. Forward estimates are premium |
| `fmp` | yes (free) | Financial Modeling Prep `/stable/` API; ~250 req/day |
| `mock` | — | Bundled demo data (default) |

```bash
# Free + robust (recommended):
DATA_PROVIDER=auto
FINNHUB_API_KEY=your_finnhub_key   # optional but enables the reliable fallback
```

Get a free Finnhub key at <https://finnhub.io>. Each provider degrades
gracefully (missing fields fall back to neutral defaults) and the provider layer
falls back to demo data if a source is unreachable. See `.env.example` for all
options (per-provider symbol caps, FMP screener/forward toggles). The shared
universe lives in `lib/data/watchlist.ts`.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: **New Project → Import** the repo (framework auto-detected: Next.js).
3. (Optional) Add environment variables for live data:
   - `DATA_PROVIDER = fmp`
   - `FMP_API_KEY = your_key_here`
4. **Deploy.** That's it.

> 🔒 Never commit your API key. Set it only as a Vercel environment variable or
> in a local `.env.local` (which is git-ignored).

## Project structure

```
app/
  page.tsx              # Server component: fetch + score + render
  layout.tsx
  globals.css
  api/stocks/route.ts   # JSON API of scored stocks
components/
  Dashboard.tsx         # Single ranking, filters, method explainer (client)
  StockCard.tsx         # Per-stock card with thesis, window, breakdown
  ScoreRing.tsx         # Circular Breakout-score gauge
  ScoreBar.tsx
lib/
  types.ts              # Domain types
  scoring.ts            # The scoring engine (the brain)
  format.ts             # Display helpers
  data/
    provider.ts         # Chooses mock vs fmp via DATA_PROVIDER
    mockStocks.ts       # Demo dataset
    fmp.ts              # Financial Modeling Prep adapter (watchlist or screener)
  backtest/
    engine.ts           # Spearman + quintile spread + weight calibration
    synthetic.ts        # Offline demonstration dataset
    types.ts
scripts/
  backtest.mts          # `npm run backtest`
```

## Backtest & weight calibration

Weights are opinions until validated. The backtest checks whether a higher
Breakout score actually precedes higher forward returns, and calibrates the
factor weights on the data:

```bash
npm run backtest
```

It reports the **Spearman rank correlation** (does score track forward return?)
and the **top-vs-bottom quintile spread** (does the ranking pay?), calibrating
weights on a TRAIN split and reporting them on a held-out TEST split so the
numbers aren't in-sample overfitting. Suggested weights are written to
`backtest-results.json`; adopt them by pasting into `DEFAULT_WEIGHTS` in
`lib/scoring.ts`.

> **Honest caveat:** out of the box this runs on a **synthetic** dataset — it
> proves the *machinery* (and recovers the hidden signal), not the real-world
> model. Rigorous validation needs **point-in-time** historical fundamentals
> (to avoid look-ahead and survivorship bias), which the FMP free tier doesn't
> fully provide. The harness is built to accept a real dataset
> (`BACKTEST_SOURCE`); wiring a paid point-in-time source is the remaining step.

## Roadmap ideas

- **Wire real point-in-time data into the backtest** — the one thing standing
  between "reasonable heuristic" and "validated model".
- Add news/catalyst feed and earnings-date proximity to the timeframe model.
- Quarterly (not just annual) acceleration and free-cash-flow inflection signals.
- Walk-forward (rolling) calibration and regularization to resist overfitting.
- Watchlists, alerts, and per-user portfolios.
- Optional AI-written narratives (Claude) on top of the rule-based reasons.
