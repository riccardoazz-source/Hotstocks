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

## Use real market data (Financial Modeling Prep)

1. Get a free API key at <https://site.financialmodelingprep.com/>.
2. Create `.env.local`:

   ```bash
   DATA_PROVIDER=fmp
   FMP_API_KEY=your_key_here
   ```

3. Restart `npm run dev`.

The adapter (`lib/data/fmp.ts`) uses FMP's current **`/stable/`** API (the
legacy `/api/v3/` and `/api/v4/` routes were retired after 2025-08-31 and now
return `403` for newer keys). It fetches a curated watchlist and degrades
gracefully: if an endpoint isn't on your plan, that field falls back to a
neutral default and scoring still works. Results are cached for 6 hours to stay
within the free tier's ~250 requests/day budget. Edit the `WATCHLIST` array in
`lib/data/fmp.ts` to change the universe (each entry carries a display sector so
no extra API call is needed just for that).

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
    fmp.ts              # Financial Modeling Prep adapter
```

## Roadmap ideas

- **Live universe via FMP screener** — replace the curated watchlist with a
  dynamic small/mid-cap screen so candidates aren't hand-picked (biggest win).
- **Backtest** the score against historical returns to calibrate the weights.
- Add news/catalyst feed and earnings-date proximity to the timeframe model.
- Quarterly (not just annual) acceleration and free-cash-flow inflection signals.
- Watchlists, alerts, and per-user portfolios.
- Optional AI-written narratives (Claude) on top of the rule-based reasons.
