import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMarketRssNews } from './src/lib/data/newsFeed.ts';
import { TwelveDataMarketDataAdapter } from './src/lib/data/twelveDataAdapter.ts';
import type {
  CapitalConfig,
  FilterConfig,
  MarketContext,
  MarketDataProvider,
  NewsItem,
  ScanResponse,
  ShortlistItem,
  StockMarketSnapshot,
} from './src/lib/data/types.ts';
import { NSE_UNIVERSE } from './src/lib/data/universe.ts';
import { YahooMarketDataAdapter } from './src/lib/data/yahooAdapter.ts';
import { DEFAULT_FILTER_CONFIG } from './src/lib/engine/filters.ts';
import { computeShortlistCorrelationMatrix } from './src/lib/engine/correlation.ts';
import { computeSectorBreadth, evaluateUniverse, selectTopShortlist } from './src/lib/engine/scoring.ts';
import { computePositionSizing, DEFAULT_CAPITAL_CONFIG } from './src/lib/engine/sizing.ts';
import { getIstSessionInfo } from './src/lib/session/istClock.ts';
import { analyzeNewsMarketImpact } from './src/server/aiNewsImpact.ts';
import { generateShortlistRationales, type RationaleInputStock } from './src/server/aiRationale.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function getActiveDataAdapter(): {
  adapter: MarketDataProvider;
  twelveDataConfigured: boolean;
  dataProviderNote: string | null;
} {
  const tdKey = process.env.TWELVEDATA_API_KEY?.trim() ?? '';
  const wantYahoo = process.env.DATA_PROVIDER?.toLowerCase() === 'yahoo';
  const twelveDataConfigured = Boolean(tdKey && tdKey !== 'MY_TWELVEDATA_API_KEY');

  if (!wantYahoo && twelveDataConfigured) {
    return {
      adapter: new TwelveDataMarketDataAdapter(tdKey),
      twelveDataConfigured: true,
      dataProviderNote: null,
    };
  }

  return {
    adapter: new YahooMarketDataAdapter(),
    twelveDataConfigured,
    dataProviderNote: twelveDataConfigured
      ? null
      : 'TWELVEDATA_API_KEY is not set in .env yet — displaying Yahoo Finance fallback data until TWELVEDATA_API_KEY is added.',
  };
}

interface SnapshotCache {
  fetchedAt: number;
  providerName: string;
  marketContext: MarketContext;
  snapshots: StockMarketSnapshot[];
  preOpenAvailable: boolean;
  dataSource: string;
  dataProviderNote: string | null;
  newsItems: NewsItem[];
  newsSource: string;
}

let scanCache: SnapshotCache | null = null;
const CACHE_TTL_MS = 180_000;

function sanitizeFilterConfig(raw: unknown): FilterConfig {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<FilterConfig>;
  const clamp = (val: unknown, fallback: number, min: number, max: number) =>
    typeof val === 'number' && Number.isFinite(val)
      ? Math.min(max, Math.max(min, val))
      : fallback;

  const minAtr = clamp(input.minAtrPct, DEFAULT_FILTER_CONFIG.minAtrPct, 0.2, 5.0);
  const maxAtr = Math.max(minAtr + 0.2, clamp(input.maxAtrPct, DEFAULT_FILTER_CONFIG.maxAtrPct, 0.5, 10.0));

  return {
    minAvgVolume: clamp(input.minAvgVolume, DEFAULT_FILTER_CONFIG.minAvgVolume, 50_000, 50_000_000),
    maxSpreadPct: clamp(input.maxSpreadPct, DEFAULT_FILTER_CONFIG.maxSpreadPct, 0.01, 2.0),
    minAtrPct: minAtr,
    maxAtrPct: maxAtr,
    minPrice: clamp(input.minPrice, DEFAULT_FILTER_CONFIG.minPrice, 10, 10_000),
    minFreeFloatPct: clamp(input.minFreeFloatPct, DEFAULT_FILTER_CONFIG.minFreeFloatPct, 5, 90),
    unusualVolumeMultiplier: clamp(
      input.unusualVolumeMultiplier,
      DEFAULT_FILTER_CONFIG.unusualVolumeMultiplier,
      1.0,
      5.0,
    ),
    pricedInMovePct: clamp(input.pricedInMovePct, DEFAULT_FILTER_CONFIG.pricedInMovePct, 1.0, 15.0),
  };
}

function sanitizeCapitalConfig(raw: unknown): CapitalConfig {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Partial<CapitalConfig>;
  const clamp = (val: unknown, fallback: number, min: number, max: number) =>
    typeof val === 'number' && Number.isFinite(val)
      ? Math.min(max, Math.max(min, val))
      : fallback;

  return {
    totalCapital: clamp(input.totalCapital, DEFAULT_CAPITAL_CONFIG.totalCapital, 10_000, 100_000_000),
    riskPerTradePct: clamp(input.riskPerTradePct, DEFAULT_CAPITAL_CONFIG.riskPerTradePct, 0.1, 5.0),
    maxStocks: Math.round(clamp(input.maxStocks, DEFAULT_CAPITAL_CONFIG.maxStocks, 3, 5)),
    directionMode: input.directionMode === 'LONG_ONLY' ? 'LONG_ONLY' : 'BOTH',
  };
}

async function getMarketSnapshotBundle(forceRefresh = false): Promise<SnapshotCache> {
  const { adapter, dataProviderNote } = getActiveDataAdapter();

  if (
    !forceRefresh &&
    scanCache &&
    scanCache.providerName === adapter.providerName &&
    Date.now() - scanCache.fetchedAt < CACHE_TTL_MS
  ) {
    return scanCache;
  }

  const [marketContext, universeResult, newsResult] = await Promise.all([
    adapter.getMarketContext(),
    adapter.getUniverseSnapshots(NSE_UNIVERSE),
    fetchMarketRssNews(NSE_UNIVERSE, forceRefresh),
  ]);

  scanCache = {
    fetchedAt: Date.now(),
    providerName: adapter.providerName,
    marketContext,
    snapshots: universeResult.snapshots,
    preOpenAvailable: universeResult.preOpenAvailable,
    dataSource: universeResult.source,
    dataProviderNote,
    newsItems: newsResult.items,
    newsSource: newsResult.sourceSummary,
  };

  return scanCache;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const { adapter, twelveDataConfigured } = getActiveDataAdapter();
    const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
    res.json({
      ok: true,
      dataProvider: adapter.providerName,
      twelveDataConfigured,
      geminiConfigured: Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY'),
      aiModel: 'gemini-4-hydrogen',
    });
  });

  app.post('/api/scan', async (req, res) => {
    try {
      const filterConfig = sanitizeFilterConfig(req.body?.filterConfig);
      const capitalConfig = sanitizeCapitalConfig(req.body?.capitalConfig);
      const forceRefresh = req.body?.forceRefresh === true;

      const bundle = await getMarketSnapshotBundle(forceRefresh);
      const session = getIstSessionInfo();
      const niftyChangePct = bundle.marketContext.nifty50.changePct ?? 0;

      const candidates = evaluateUniverse(
        bundle.snapshots,
        niftyChangePct,
        bundle.newsItems,
        filterConfig,
      );

      const sectorBreadth = computeSectorBreadth(candidates);
      const topSelected = selectTopShortlist(
        candidates,
        capitalConfig.maxStocks,
        capitalConfig.directionMode,
      );
      const shortlist: ShortlistItem[] = topSelected.map((evaluation, idx) => ({
        rank: idx + 1,
        evaluation,
        sizing: computePositionSizing(evaluation, capitalConfig, topSelected.length),
        aiRationale: null,
      }));

      const correlation = computeShortlistCorrelationMatrix(topSelected);

      const preOpenUnavailableNote = !bundle.preOpenAvailable
        ? `Pre-open order-book data is unavailable on ${bundle.dataSource} — falling back to previous session close & Nifty/GIFT Nifty direction.`
        : null;

      const payload: ScanResponse = {
        session,
        marketContext: bundle.marketContext,
        sectorBreadth,
        preOpenUnavailableNote,
        dataProviderNote: bundle.dataProviderNote,
        candidates,
        shortlist,
        correlation,
        newsFeedCount: bundle.newsItems.length,
        newsSource: bundle.newsSource,
        dataSource: bundle.dataSource,
        generatedAt: new Date().toISOString(),
      };

      res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to scan NSE universe';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/rationale', async (req, res) => {
    try {
      const stocks = Array.isArray(req.body?.stocks) ? (req.body.stocks as RationaleInputStock[]) : [];
      const marketContextSummary =
        typeof req.body?.marketContextSummary === 'string'
          ? req.body.marketContextSummary.slice(0, 600)
          : 'NSE Pre-Market Session';

      if (stocks.length === 0 || stocks.length > 5) {
        res.status(400).json({ error: 'Provide between 1 and 5 shortlisted stocks.' });
        return;
      }

      const result = await generateShortlistRationales(stocks, marketContextSummary);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI rationale generation failed';
      res.status(500).json({ rationales: [], error: message });
    }
  });

  app.get('/api/news', async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === '1';
      const news = await fetchMarketRssNews(NSE_UNIVERSE, forceRefresh);
      res.json({
        items: news.items,
        source: news.sourceSummary,
        fetchedAt: news.fetchedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch market news';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/news-impact', async (req, res) => {
    try {
      const headlines = Array.isArray(req.body?.headlines) ? (req.body.headlines as NewsItem[]) : [];
      const sectorContextSummary =
        typeof req.body?.sectorContextSummary === 'string'
          ? req.body.sectorContextSummary.slice(0, 600)
          : 'NSE Equities Pre-Market Session';

      if (headlines.length === 0 || headlines.length > 8) {
        res.status(400).json({ error: 'Provide between 1 and 8 headlines to analyze.' });
        return;
      }

      const result = await analyzeNewsMarketImpact(headlines, sectorContextSummary);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI news impact analysis failed';
      res.status(500).json({ impacts: [], error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PreOpen NSE server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
