/**
 * Shared curated universe used by the live data providers.
 *
 * Deliberately tilted toward small/mid-cap, under-covered growth names across
 * many themes (where future breakouts come from), with a few mega-caps kept as
 * a "control" — the forward-looking model should rank those LOW. Each entry
 * carries a display sector so providers don't spend a call just to fetch it.
 *
 * Providers may use all of these (Yahoo: no rate limit) or a slice (FMP free
 * tier: ~250 requests/day).
 */
export const CURATED_WATCHLIST: { symbol: string; sector: string }[] = [
  // Small / mid-cap growth candidates (the real hunting ground)
  { symbol: "CRDO", sector: "Semiconductors" },
  { symbol: "ALAB", sector: "Semiconductors" },
  { symbol: "ONTO", sector: "Semiconductor Equipment" },
  { symbol: "SNDK", sector: "Semiconductors" },
  { symbol: "NBIS", sector: "Cloud Infrastructure" },
  { symbol: "RKLB", sector: "Aerospace" },
  { symbol: "RXRX", sector: "Biotech / AI" },
  { symbol: "TMDX", sector: "Medical Devices" },
  { symbol: "HIMS", sector: "Health Tech" },
  { symbol: "CAVA", sector: "Restaurants" },
  { symbol: "DUOL", sector: "Software" },
  { symbol: "TOST", sector: "Fintech" },
  { symbol: "AFRM", sector: "Fintech" },
  { symbol: "NXT", sector: "Clean Energy" },
  { symbol: "FLNC", sector: "Clean Energy" },
  { symbol: "POWL", sector: "Industrials" },
  { symbol: "CLS", sector: "Electronics Manufacturing" },
  { symbol: "VRT", sector: "Datacenter Infrastructure" },
  { symbol: "IOT", sector: "Software" },
  { symbol: "NET", sector: "Software" },
  { symbol: "SMCI", sector: "Datacenter Hardware" },
  { symbol: "MU", sector: "Semiconductors" },
  { symbol: "ARM", sector: "Semiconductors" },
  // Mega-cap "control" group — should rank low under the model
  { symbol: "NVDA", sector: "Semiconductors" },
  { symbol: "AMD", sector: "Semiconductors" },
  { symbol: "TSM", sector: "Semiconductors" },
  { symbol: "PLTR", sector: "Software" },
];
