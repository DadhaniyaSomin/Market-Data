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
  circuitBandPct: number;
  isT2T: boolean;
  freeFloatPct: number;
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
  id: string;
  title: string;
  summary: string;
  link: string;
  pubDate: string;
  source: string;
  matchedSymbols: string[];
  matchedSectors: string[];
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
  bidAskSpreadPct: number | null;
  preOpenIndicativePrice: number | null;
  preOpenIndicativeVolume: number | null;
  preOpenAvailable: boolean;
  dailyBars: OHLCVBar[];
  intraday15mBars: OHLCVBar[];
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
  indiaVix: IndexQuote;
  usClose: IndexQuote;
  brentCrude: IndexQuote;
  usdInr: IndexQuote;
  riskRegime: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  riskRationale: string;
  timestamp: string;
  source: string;
}

export interface SectorBreadthItem {
  sector: string;
  avgChangePct: number;
  advancers: number;
  decliners: number;
  total: number;
  leaderTicker: string;
  leaderChangePct: number;
}

export interface FilterConfig {
  minAvgVolume: number;
  maxSpreadPct: number;
  minAtrPct: number;
  maxAtrPct: number;
  minPrice: number;
  minFreeFloatPct: number;
  unusualVolumeMultiplier: number;
  pricedInMovePct: number;
}

export type DirectionMode = 'BOTH' | 'LONG_ONLY';

export interface CapitalConfig {
  totalCapital: number;
  riskPerTradePct: number;
  maxStocks: number;
  directionMode: DirectionMode;
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
  totalScore: number;
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
  target: number;
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

export interface CorrelationPairAlert {
  tickerA: string;
  tickerB: string;
  sectorA: string;
  sectorB: string;
  correlation: number;
  sameSector: boolean;
}

export interface CorrelationMatrixResult {
  tickers: string[];
  sectors: string[];
  matrix: Array<Array<number | null>>; // N x N Pearson correlation (-1 to +1)
  lookbackSessions: number;
  avgPairwiseCorrelation: number | null;
  highCorrelationPairs: CorrelationPairAlert[];
  sameSectorClusters: Array<{ sector: string; tickers: string[] }>;
  concentrationLevel: 'LOW_CONCENTRATION' | 'MODERATE_OVERLAP' | 'HIGH_CONCENTRATION';
  summaryNote: string;
}

export interface ScanResponse {
  session: SessionClockInfo;
  marketContext: MarketContext;
  sectorBreadth: SectorBreadthItem[];
  preOpenUnavailableNote: string | null;
  dataProviderNote: string | null;
  candidates: StockEvaluation[];
  shortlist: ShortlistItem[];
  correlation: CorrelationMatrixResult | null;
  newsFeedCount: number;
  newsSource: string;
  dataSource: string;
  generatedAt: string;
}

export interface NewsImpactItem {
  id: string;
  title: string;
  scope: 'COMPANY' | 'SECTOR' | 'MACRO';
  targetEntity: string;
  expectedDirection: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL';
  sectorReaction: string;
  companyReaction: string;
  watchPoint: string;
  model: string;
}

export type JournalOutcome =
  | 'PENDING'
  | 'TRIGGERED'
  | 'TARGET_HIT'
  | 'SL_HIT'
  | 'NO_ENTRY';

export interface JournalEntry {
  id: string;
  savedAt: string;
  sessionDate: string;
  ticker: string;
  name: string;
  sector: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  target: number;
  quantity: number;
  plannedRisk: number;
  score: number;
  outcome: JournalOutcome;
  realizedPnl: number | null;
  notes: string;
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
