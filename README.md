# 🔥 Hotstocks

A quantitative stock screener that ranks high-potential "hot" stocks, explains
**why** each one stands out, and estimates roughly **when** a re-rating could
play out. Built with Next.js and designed to deploy on Vercel in one click.

> **Not financial advice.** Hotstocks is an educational tool. Its scores and
> timeframes are model estimates derived from public fundamentals, price
> momentum, analyst sentiment and valuation — not predictions or guarantees.

## What it does

Three views over the same scored universe:

1. **🔎 Discovery — "Find the next Nvidia"**
   Surfaces early-stage names (high revenue growth + room to scale) before they
   become mega-caps. Ranked by a dedicated `nextGenScore`.
2. **⏱ Rank · When**
   Orders the best hotstocks by how soon a re-rating could realistically
   happen (`0–3`, `3–9`, `9–24 months`), each with a confidence meter.
3. **💡 Rank · Why**
   Orders by overall **Hotness** and shows the top reasons plus a full factor
   breakdown.

## How the scoring works

Each stock gets a 0–100 **Hotness** score, a weighted blend of five factors
(see `lib/scoring.ts`):

| Factor | Weight | Signal |
| --- | --- | --- |
| Growth | 30% | Revenue & earnings growth (YoY) |
| Momentum | 25% | 3-month / 1-year price change, RSI |
| Analyst sentiment | 20% | Buy ratio + price-target upside |
| Early-stage upside | 15% | Smaller cap = more room to multiply |
| Valuation discipline | 10% | Valuation relative to growth |

`timeframe` is derived from momentum + analyst urgency; `confidence` from
analyst coverage, agreement and how consistent the signals are. All weights and
thresholds live in `lib/scoring.ts` — tune them freely.

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

The adapter (`lib/data/fmp.ts`) fetches a curated watchlist and degrades
gracefully: if an endpoint isn't on your plan, that field falls back to a
neutral default and scoring still works. Results are cached for 30 minutes to
stay within free-tier limits. Edit the `WATCHLIST` array to change the universe.

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
  Dashboard.tsx         # Tabs, search, ranking logic (client)
  StockCard.tsx
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

- Add news/catalyst feed and earnings-date proximity to the timeframe model.
- Backtest the score against historical returns to calibrate weights.
- Watchlists, alerts, and per-user portfolios.
- Optional AI-written narratives (Claude) on top of the rule-based reasons.
