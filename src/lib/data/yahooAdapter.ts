import type {
  IndexQuote,
  MarketContext,
  MarketDataProvider,
  OHLCVBar,
  StockMarketSnapshot,
  UniverseMeta,
} from './types.ts';

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        regularMarketVolume?: number;
        regularMarketTime?: number;
        preMarketPrice?: number;
        preMarketVolume?: number;
        bid?: number;
        ask?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
}

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

function parseBars(result: NonNullable<NonNullable<YahooChartResponse['chart']>['result']>[number]): OHLCVBar[] {
  const timestamps = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0];
  if (!q) return [];

  const bars: OHLCVBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const close = q.close?.[i];
    const volume = q.volume?.[i] ?? 0;

    if (
      typeof open === 'number' &&
      typeof high === 'number' &&
      typeof low === 'number' &&
      typeof close === 'number' &&
      Number.isFinite(open) &&
      Number.isFinite(high) &&
      Number.isFinite(low) &&
      Number.isFinite(close)
    ) {
      bars.push({
        timestamp: timestamps[i] * 1000,
        open,
        high,
        low,
        close,
        volume: typeof volume === 'number' && Number.isFinite(volume) ? volume : 0,
      });
    }
  }
  return bars;
}

async function fetchYahooChart(symbol: string, range: string, interval: string): Promise<YahooChartResponse | null> {
  try {
    const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=true`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PreOpenNSE/1.0)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    return (await res.json()) as YahooChartResponse;
  } catch {
    return null;
  }
}

async function fetchIndexQuote(symbol: string, name: string, note?: string): Promise<IndexQuote> {
  const data = await fetchYahooChart(symbol, '5d', '1d');
  const result = data?.chart?.result?.[0];
  if (!result) {
    return {
      symbol,
      name,
      price: null,
      previousClose: null,
      change: null,
      changePct: null,
      timestamp: new Date().toISOString(),
      source: 'Yahoo Finance v8',
      note: note ?? 'Unavailable',
    };
  }

  const bars = parseBars(result);
  const meta = result.meta ?? {};
  const latestBar = bars[bars.length - 1];
  const prevBar = bars.length >= 2 ? bars[bars.length - 2] : undefined;

  const price = meta.regularMarketPrice ?? latestBar?.close ?? null;
  const previousClose = prevBar?.close ?? meta.previousClose ?? meta.chartPreviousClose ?? null;

  let change: number | null = null;
  let changePct: number | null = null;
  if (price !== null && previousClose !== null && previousClose !== 0) {
    change = price - previousClose;
    changePct = (change / previousClose) * 100;
  }

  const ts = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString()
    : new Date().toISOString();

  return {
    symbol,
    name,
    price,
    previousClose,
    change,
    changePct,
    timestamp: ts,
    source: 'Yahoo Finance v8',
    note,
  };
}

/**
 * Keep only the most recent trading session's 15-minute bars (by IST date).
 */
function extractLatestSessionBars(bars: OHLCVBar[]): OHLCVBar[] {
  if (bars.length === 0) return [];
  const toIstDate = (ms: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(ms));

  const lastDate = toIstDate(bars[bars.length - 1].timestamp);
  return bars.filter((b) => toIstDate(b.timestamp) === lastDate);
}

export class YahooMarketDataAdapter implements MarketDataProvider {
  readonly providerName = 'Yahoo Finance (v8 Chart API)';

  async getMarketContext(): Promise<MarketContext> {
    const [nifty50, bankNifty, usClose, brentCrude, usdInr] = await Promise.all([
      fetchIndexQuote('^NSEI', 'Nifty 50'),
      fetchIndexQuote('^NSEBANK', 'Bank Nifty'),
      fetchIndexQuote('^GSPC', 'US Close (S&P 500)'),
      fetchIndexQuote('BZ=F', 'Brent Crude ($/bbl)'),
      fetchIndexQuote('INR=X', 'USD / INR'),
    ]);

    // GIFT Nifty is not directly published on Yahoo free v8 API.
    // Never fabricate a separate value; expose unavailable status alongside Nifty 50 proxy direction.
    const giftNifty: IndexQuote = {
      symbol: 'GIFTNIFTY',
      name: 'GIFT Nifty',
      price: null,
      previousClose: null,
      change: null,
      changePct: null,
      timestamp: nifty50.timestamp,
      source: 'Yahoo Finance (Unavailable)',
      note:
        nifty50.changePct !== null
          ? `Direct feed unavailable on Yahoo free API; Nifty 50 last session ${nifty50.changePct >= 0 ? '+' : ''}${nifty50.changePct.toFixed(2)}%`
          : 'Direct GIFT Nifty feed unavailable on Yahoo free API',
    };

    // Deterministic Risk-On / Risk-Off classification from real macro inputs
    let riskScore = 0;
    const drivers: string[] = [];

    if (usClose.changePct !== null) {
      if (usClose.changePct >= 0.3) {
        riskScore += 1;
        drivers.push(`S&P 500 +${usClose.changePct.toFixed(2)}%`);
      } else if (usClose.changePct <= -0.3) {
        riskScore -= 1;
        drivers.push(`S&P 500 ${usClose.changePct.toFixed(2)}%`);
      }
    }
    if (nifty50.changePct !== null) {
      if (nifty50.changePct >= 0.25) {
        riskScore += 1;
        drivers.push(`Nifty ${nifty50.changePct >= 0 ? '+' : ''}${nifty50.changePct.toFixed(2)}%`);
      } else if (nifty50.changePct <= -0.25) {
        riskScore -= 1;
        drivers.push(`Nifty ${nifty50.changePct.toFixed(2)}%`);
      }
    }
    if (brentCrude.changePct !== null && brentCrude.changePct > 2.5) {
      riskScore -= 1;
      drivers.push(`Brent crude spike +${brentCrude.changePct.toFixed(2)}%`);
    }
    if (usdInr.changePct !== null && usdInr.changePct > 0.35) {
      riskScore -= 1;
      drivers.push(`INR weakening +${usdInr.changePct.toFixed(2)}%`);
    }

    const riskRegime =
      riskScore >= 1 ? 'RISK_ON' : riskScore <= -1 ? 'RISK_OFF' : 'NEUTRAL';

    const riskRationale =
      drivers.length > 0
        ? drivers.join(' · ')
        : 'Mixed macro cues across US close, crude, and INR';

    return {
      giftNifty,
      nifty50,
      bankNifty,
      usClose,
      brentCrude,
      usdInr,
      riskRegime,
      riskRationale,
      timestamp: new Date().toISOString(),
      source: this.providerName,
    };
  }

  async getUniverseSnapshots(universe: UniverseMeta[]): Promise<{
    snapshots: StockMarketSnapshot[];
    preOpenAvailable: boolean;
    source: string;
    timestamp: string;
  }> {
    const snapshots: StockMarketSnapshot[] = [];
    let anyPreOpenAvailable = false;

    // Batch requests in chunks of 7 to be polite to Yahoo Finance rate limits
    const chunkSize = 7;
    for (let i = 0; i < universe.length; i += chunkSize) {
      const chunk = universe.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map(async (meta): Promise<StockMarketSnapshot | null> => {
          const [dailyRes, intradayRes] = await Promise.all([
            fetchYahooChart(meta.symbol, '2mo', '1d'),
            fetchYahooChart(meta.symbol, '5d', '15m'),
          ]);

          const dailyResult = dailyRes?.chart?.result?.[0];
          if (!dailyResult) return null;

          const dailyBars = parseBars(dailyResult);
          if (dailyBars.length < 2) return null;

          const intradayResult = intradayRes?.chart?.result?.[0];
          const all15m = intradayResult ? parseBars(intradayResult) : [];
          const intraday15mBars = extractLatestSessionBars(all15m);

          const latestDaily = dailyBars[dailyBars.length - 1];
          const prevDaily = dailyBars[dailyBars.length - 2];

          const dMeta = dailyResult.meta ?? {};
          const price = dMeta.regularMarketPrice ?? latestDaily.close;
          const previousClose = prevDaily.close;
          const open = latestDaily.open;
          const high = dMeta.regularMarketDayHigh ?? latestDaily.high;
          const low = dMeta.regularMarketDayLow ?? latestDaily.low;
          const volume = dMeta.regularMarketVolume ?? latestDaily.volume;

          // 20-day average daily volume excluding today's incomplete/latest bar if >= 21 bars exist
          const historyForAvg =
            dailyBars.length > 20
              ? dailyBars.slice(dailyBars.length - 21, dailyBars.length - 1)
              : dailyBars.slice(0, dailyBars.length - 1);
          const avgVolume20 =
            historyForAvg.length > 0
              ? historyForAvg.reduce((sum, b) => sum + b.volume, 0) / historyForAvg.length
              : volume;

          const changePct = previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;
          const gapPct = previousClose > 0 ? ((open - previousClose) / previousClose) * 100 : 0;
          const volumeRatio = avgVolume20 > 0 ? volume / avgVolume20 : 1;

          let bidAskSpreadPct: number | null = null;
          if (
            typeof dMeta.bid === 'number' &&
            typeof dMeta.ask === 'number' &&
            dMeta.bid > 0 &&
            dMeta.ask >= dMeta.bid
          ) {
            const mid = (dMeta.bid + dMeta.ask) / 2;
            bidAskSpreadPct = mid > 0 ? ((dMeta.ask - dMeta.bid) / mid) * 100 : null;
          }

          const preOpenPrice =
            typeof dMeta.preMarketPrice === 'number' && dMeta.preMarketPrice > 0
              ? dMeta.preMarketPrice
              : null;
          const preOpenVol =
            typeof dMeta.preMarketVolume === 'number' && dMeta.preMarketVolume > 0
              ? dMeta.preMarketVolume
              : null;
          const preOpenAvailable = preOpenPrice !== null;
          if (preOpenAvailable) anyPreOpenAvailable = true;

          const ts = dMeta.regularMarketTime
            ? new Date(dMeta.regularMarketTime * 1000).toISOString()
            : new Date(latestDaily.timestamp).toISOString();

          return {
            meta,
            price,
            previousClose,
            open,
            high,
            low,
            volume,
            avgVolume20,
            changePct,
            gapPct,
            volumeRatio,
            bidAskSpreadPct,
            preOpenIndicativePrice: preOpenPrice,
            preOpenIndicativeVolume: preOpenVol,
            preOpenAvailable,
            dailyBars,
            intraday15mBars,
            dataTimestamp: ts,
            source: this.providerName,
          };
        }),
      );

      for (const item of chunkResults) {
        if (item) snapshots.push(item);
      }
    }

    return {
      snapshots,
      preOpenAvailable: anyPreOpenAvailable,
      source: this.providerName,
      timestamp: new Date().toISOString(),
    };
  }
}
