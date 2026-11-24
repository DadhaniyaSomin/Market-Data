# Switching Data Providers: Yahoo Finance → Groww API

The scanner isolates all market-data fetching behind the `MarketDataProvider` interface (`src/lib/data/types.ts`):

```ts
export interface MarketDataProvider {
  readonly providerName: string;
  getMarketContext(): Promise<MarketContext>;
  getUniverseSnapshots(universe: UniverseMeta[]): Promise<{
    snapshots: StockMarketSnapshot[];
    preOpenAvailable: boolean;
    source: string;
    timestamp: string;
  }>;
}
```

## Steps to Wire `GrowwMarketDataAdapter`

1. **Store Credentials Server-Side Only**:
   Add `GROWW_API_KEY` (and TOTP/access token variables as required by your Groww API app) to `.env` — never prefix with `VITE_`.

2. **Create `src/lib/data/growwAdapter.ts`**:
   - **L1 Bid-Ask Spread**: Fetch Groww live quote (`depth.buy[0].price`, `depth.sell[0].price`) and compute:
     `bidAskSpreadPct = ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 100`
   - **Pre-Open Session (09:00–09:12 IST)**: Populate `preOpenIndicativePrice`, `preOpenIndicativeVolume`, and set `preOpenAvailable = true` when Groww's pre-open equilibrium LTP/volume fields are non-zero.
   - **Historical Candles**: Map Groww daily candles (`2mo`, `1d`) to `dailyBars` and intraday (`5d`, `15m`) to `intraday15mBars` (using `OHLCVBar`).
   - **Market Context**: Map Nifty 50, Bank Nifty, GIFT Nifty (if available via your feed), US Close, Crude, and USD/INR to `IndexQuote`.

3. **Register in `server.ts`**:
   ```ts
   const dataAdapter: MarketDataProvider =
     process.env.DATA_PROVIDER === 'groww'
       ? new GrowwMarketDataAdapter()
       : new YahooMarketDataAdapter();
   ```

The deterministic filter (`filters.ts`), scoring (`scoring.ts`), position sizing (`sizing.ts`), and AI rationale (`aiRationale.ts`) layers require zero changes.
