export type MarketSessionPhase =
  | 'PRE_OPEN_COLLECTION'
  | 'PRE_OPEN_DISCOVERY'
  | 'PRE_OPEN_TRANSITION'
  | 'MARKET_OPEN'
  | 'MARKET_CLOSED';

export interface SessionClockInfo {
  phase: MarketSessionPhase;
  label: string;
  istTimeDisplay: string;
  istDateDisplay: string;
  isMarketClosed: boolean;
  isPreOpenWindow: boolean;
  sessionNote: string;
}

export interface UniverseMeta {
  symbol: string; // e.g. "RELIANCE.NS"
  ticker: string; // e.g. "RELIANCE"
  name: string;
  sector: string;
  aliases: string[];
  circuitBandPct: number; // e.g. 10 or 20 (NSE F&O stocks have dynamic 10%/no rigid 5% freeze; 5% = restricted)
  isT2T: boolean; // Trade-to-Trade / BE segment flag
  freeFloatPct: number; // Approximate NSE free float %
  isFnO: boolean;
}

export interface OHLCVBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  matchedSymbols: string[];
  isResultsNews: boolean;
  isSectorNews: boolean;
}

export interface StockMarketSnapshot {
  meta: UniverseMeta;
  price: number;
  previousClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  avgVolume20: number;
  changePct: number;
  gapPct: number;
  volumeRatio: number;
  bidAskSpreadPct: number | null; // Null if L1 quote is unavailable on provider
  preOpenIndicativePrice: number | null;
  preOpenIndicativeVolume: number | null;
  preOpenAvailable: boolean;
  dailyBars: OHLCVBar[]; // ~25-30 daily bars
  intraday15mBars: OHLCVBar[]; // Latest session 15-min bars
  dataTimestamp: string;
  source: string;
}

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  timestamp: string;
  source: string;
  note?: string;
}

export interface MarketContext {
  giftNifty: IndexQuote;
  nifty50: IndexQuote;
  bankNifty: IndexQuote;
  usClose: IndexQuote;
  brentCrude: IndexQuote;
  usdInr: IndexQuote;
  riskRegime: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  riskRationale: string;
  timestamp: string;
  source: string;
}

export interface FilterConfig {
  minAvgVolume: number; // Default 1_000_000 shares
  maxSpreadPct: number; // Default 0.1 (%)
  minAtrPct: number; // Default 1.5 (%)
  maxAtrPct: number; // Default 2.5 (%)
  minPrice: number; // Default 100 (INR)
  minFreeFloatPct: number; // Default 25 (%)
  unusualVolumeMultiplier: number; // Default 1.5x 20-day avg
  pricedInMovePct: number; // Default 3.0%
}

export interface CapitalConfig {
  totalCapital: number; // INR, default 500000
  riskPerTradePct: number; // Default 1.0 (%)
  maxStocks: number; // 3-5, default 4
}

export type CriterionKey =
  | 'liquidity'
  | 'volatility'
  | 'restrictions'
  | 'catalyst'
  | 'technical';

export interface CriterionEvaluation {
  key: CriterionKey;
  label: string;
  pass: boolean;
  hardFail: boolean;
  score: 0 | 1 | 2;
  actualValue: string;
  thresholdNote: string;
  details: string;
}

export type CatalystFreshness = 'FRESH' | 'PRICED_IN' | 'NONE';
export type TradeDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface ComputedIndicators {
  atr14Daily: number;
  atr14DailyPct: number;
  atr14_15m: number;
  atr14_15mSource: '15m_bars' | 'daily_scaled';
  vwap: number | null;
  orbHigh: number | null;
  orbLow: number | null;
  relativeStrengthVsNifty: number;
}

export interface StockEvaluation {
  snapshot: StockMarketSnapshot;
  indicators: ComputedIndicators;
  catalystStatus: CatalystFreshness;
  matchedNews: NewsItem[];
  direction: TradeDirection;
  criteria: Record<CriterionKey, CriterionEvaluation>;
  totalScore: number; // 0 to 10
  hardFailLiquidity: boolean;
  hardFailRestrictions: boolean;
  eligibleForShortlist: boolean;
  disqualificationReasons: string[];
  candidateTags: ('TOP_GAINER' | 'TOP_LOSER' | 'VOLUME_SHOCKER' | 'GAP_UP' | 'GAP_DOWN')[];
}

export interface PositionSizing {
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  stopLossMethod: string;
  target: number; // 1:2 R:R
  riskPerShare: number;
  rawRiskAmount: number;
  rawQuantity: number;
  maxCapitalPerStock: number;
  capitalCapped: boolean;
  quantity: number;
  plannedRisk: number;
  capitalUsed: number;
  estimatedCharges: number;
  chargesBreakdown: {
    brokerage: number;
    stt: number;
    exchangeTxn: number;
    sebi: number;
    stampDuty: number;
    gst: number;
  };
}

export interface AIRationaleItem {
  ticker: string;
  rationale: string;
  risks: [string, string];
  provider: 'gemini' | 'groq';
  model: string;
}

export interface ShortlistItem {
  rank: number;
  evaluation: StockEvaluation;
  sizing: PositionSizing;
  aiRationale: AIRationaleItem | null;
}

export interface ScanResponse {
  session: SessionClockInfo;
  marketContext: MarketContext;
  preOpenUnavailableNote: string | null;
  dataProviderNote: string | null;
  candidates: StockEvaluation[];
  shortlist: ShortlistItem[];
  newsFeedCount: number;
  newsSource: string;
  dataSource: string;
  generatedAt: string;
}

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
