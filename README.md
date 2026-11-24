# PreOpen NSE — Intraday Pre-Market Shortlist

A full-stack, read-only decision-support dashboard for scanning liquid NSE equities before market open, applying a deterministic 5-point filter, calculating exact risk-capped position sizing, and generating structured AI setup rationales.

> **Disclaimer:** Educational decision-support tool only. Not SEBI-registered investment advice or a signal service. Data may be delayed. No order placement in v1.

---

## Folder Structure

```text
├── .env.example
├── README.md
├── package.json
├── server.ts                          # Express + Vite middleware & API routes (/api/scan, /api/rationale, /api/health)
├── docs/
│   └── GROWW_ADAPTER.md               # Step-by-step guide to swap YahooMarketDataAdapter -> GrowwMarketDataAdapter
└── src/
    ├── App.tsx                        # Main dashboard shell, sidebar views, state persistence
    ├── index.css                      # Tailwind CSS v4 + dark trading typography
    ├── components/
    │   ├── Sidebar.tsx                # Dashboard, Intraday Pre-Open, Watchlist, Settings
    │   ├── MarketContextBar.tsx       # GIFT Nifty, Nifty 50, BankNifty, US Close, Brent Crude, USD/INR + Risk-On/Off
    │   ├── CapitalRiskPanel.tsx       # Total capital, risk %, max stocks (3-5) & live budget readouts
    │   ├── RawCandidatesTable.tsx     # 28-stock universe with Gainers/Losers/Volume/Gap tabs & timestamp/source
    │   ├── FilterBreakdownTable.tsx   # Per-stock pass/fail + score (0-2) on all 5 criteria with actual values
    │   ├── ShortlistCards.tsx         # 3-5 top setups with Entry, SL, 1:2 Target, Qty, sizing math, charges, AI rationale
    │   ├── ChecklistPanel.tsx         # Interactive daily pre-market checklist
    │   ├── DashboardOverview.tsx      # Session summary, breadth, and top shortlist snapshot
    │   ├── WatchlistView.tsx          # Pinned NSE watchlist view
    │   └── SettingsView.tsx           # Filter threshold overrides & AI provider selector (Gemini / Groq)
    ├── lib/
    │   ├── format.ts                  # INR currency, Lakhs/Crores volume, IST timestamp formatters
    │   ├── data/
    │   │   ├── types.ts               # MarketDataProvider interface & domain types
    │   │   ├── universe.ts            # 28-stock liquid NSE universe metadata
    │   │   ├── twelveDataAdapter.ts   # Twelve Data API adapter (primary when TWELVEDATA_API_KEY is set)
    │   │   ├── yahooAdapter.ts        # Yahoo Finance v8 Chart adapter (fallback)
    │   │   └── newsFeed.ts            # Economic Times & LiveMint RSS catalyst matcher
    │   ├── engine/
    │   │   ├── indicators.ts          # ATR(14) daily, ATR(15-min), VWAP, 15m ORB, Relative Strength vs Nifty
    │   │   ├── filters.ts             # Deterministic 5-point filter
    │   │   ├── scoring.ts             # 0-2 per criterion (/10), hard-fail gates, top 3-5 selection
    │   │   ├── sizing.ts              # Position sizing, 1.5x capital cap, 1:2 R:R, NSE MIS charges estimate
    │   │   └── __tests__/             # Node built-in unit tests for filter, scoring, and sizing
    │   └── session/
    │       └── istClock.ts            # IST session classifier (09:00-09:08 collection, 09:08-09:12 discovery, open/closed)
    └── server/
        └── aiRationale.ts             # Server-side Gemini (gemini-4-hydrogen) structured JSON generator
```

---

## Run Steps

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Copy `.env.example` to `.env` and set your server-side keys:
   - `TWELVEDATA_API_KEY`: Required for Twelve Data NSE quotes and candles.
   - `GEMINI_API_KEY`: Required for Gemini (`gemini-4-hydrogen`) rationale generation.

3. **Run unit tests** (deterministic filter, scoring, and position sizing):
   ```bash
   npm test
   ```

4. **Start development server** (runs Express API + Vite frontend on port `3000`):
   ```bash
   npm run dev
   ```

5. **Production build & start**:
   ```bash
   npm run build
   npm start
   ```

---

## Switching from Yahoo Finance to Groww API

All market data access flows through the `MarketDataProvider` interface in `src/lib/data/types.ts`. Because Yahoo Finance's free v8 API does not provide live NSE L1 bid-ask spreads or 09:00–09:12 IST pre-open equilibrium order books, `YahooMarketDataAdapter` marks those fields unavailable and falls back transparently to previous close and Nifty direction.

To switch to Groww:
1. Implement `GrowwMarketDataAdapter` (`implements MarketDataProvider`) in `src/lib/data/growwAdapter.ts` using your server-side Groww Trading API token (`GROWW_API_KEY` / `GROWW_API_SECRET`).
2. Populate `bidAskSpreadPct`, `preOpenIndicativePrice`, and `preOpenIndicativeVolume` from Groww's live quote & pre-open endpoints, and 15-minute / daily OHLCV from Groww's historical candles endpoint.
3. Swap `new YahooMarketDataAdapter()` in `server.ts` with `new GrowwMarketDataAdapter()` (or toggle via `process.env.DATA_PROVIDER`).

See [`docs/GROWW_ADAPTER.md`](docs/GROWW_ADAPTER.md) for the exact mapping.
