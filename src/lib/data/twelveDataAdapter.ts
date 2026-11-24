import type {
  IndexQuote,
  MarketContext,
  MarketDataProvider,
  OHLCVBar,
  StockMarketSnapshot,
  UniverseMeta,
} from './types.ts';
import { YahooMarketDataAdapter } from './yahooAdapter.ts';

const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

interface TwelveDataQuoteResponse {
  symbol?: string;
  name?: string;
  close?: string;
  open?: string;
  high?: string;
  low?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  volume?: string;
  average_volume?: string;
  datetime?: string;
  status?: string;
  code?: number;
  message?: string;
}

interface TwelveDataTimeSeriesValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

interface TwelveDataTimeSeriesResponse {
  meta?: {
    symbol?: string;
    exchange?: string;
  };
  values?: TwelveDataTimeSeriesValue[];
  status?: string;
  code?: number;
  message?: string;
}

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseTwelveDataBars(values: TwelveDataTimeSeriesValue[] | undefined): OHLCVBar[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  // Twelve Data returns newest-first; reverse to oldest-first chronological order
  return [...values]
    .reverse()
    .map((v) => ({
      timestamp: Date.parse(v.datetime.includes(' ') ? `${v.datetime.replace(' ', 'T')}+05:30` : `${v.datetime}T09:15:00+05:30`) || Date.now(),
      open: toNum(v.open),
      high: toNum(v.high),
      low: toNum(v.low),
      close: toNum(v.close),
      volume: toNum(v.volume, 0),
    }))
    .filter((b) => b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0);
}

function extractLatestSessionBars(bars: OHLCVBar[]): OHLCVBar[] {
  if (bars.length === 0) return [];
  const toIstDate = (ms: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(ms));
  const lastDate = toIstDate(bars[bars.length - 1].timestamp);
  return bars.filter((b) => toIstDate(b.timestamp) === lastDate);
}

export class TwelveDataMarketDataAdapter implements MarketDataProvider {
  readonly providerName = 'Twelve Data API';
  private readonly apiKey: string;
  private readonly yahooFallback = new YahooMarketDataAdapter();

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  private async fetchTdJson<T>(endpoint: string, params: Record<string, string>): Promise<T | null> {
    try {
      const qs = new URLSearchParams(params);
      const url = `${TWELVE_DATA_BASE}/${endpoint}?${qs.toString()}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `apikey ${this.apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as T & { status?: string; code?: number };
      if (data && data.status === 'error') {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  private async fetchMacroQuote(
    tdSymbol: string,
    name: string,
    fallbackQuote: IndexQuote,
  ): Promise<IndexQuote> {
    const data = await this.fetchTdJson<TwelveDataQuoteResponse>('quote', { symbol: tdSymbol });
    if (!data || !data.close) {
      return fallbackQuote;
    }
    const price = toNum(data.close, NaN);
    const previousClose = toNum(data.previous_close, NaN);
    if (!Number.isFinite(price)) return fallbackQuote;

    const change = Number.isFinite(toNum(data.change, NaN))
      ? toNum(data.change)
      : Number.isFinite(previousClose)
        ? price - previousClose
        : null;
    const changePct = Number.isFinite(toNum(data.percent_change, NaN))
      ? toNum(data.percent_change)
      : Number.isFinite(previousClose) && previousClose > 0 && change !== null
        ? (change / previousClose) * 100
        : null;

    return {
      symbol: tdSymbol,
      name,
      price,
      previousClose: Number.isFinite(previousClose) ? previousClose : null,
      change,
      changePct,
      timestamp: data.datetime ? new Date(data.datetime).toISOString() : new Date().toISOString(),
      source: 'Twelve Data API',
    };
  }

  async getMarketContext(): Promise<MarketContext> {
    // Fetch baseline macro context from Yahoo fallback in parallel for indices unavailable on basic Twelve Data plans
    const yahooContext = await this.yahooFallback.getMarketContext();

    const [usClose, usdInr, nifty50, bankNifty, indiaVix, brentCrude] = await Promise.all([
      this.fetchMacroQuote('SPX', 'US Close (S&P 500)', yahooContext.usClose),
      this.fetchMacroQuote('USD/INR', 'USD / INR', yahooContext.usdInr),
      this.fetchMacroQuote('NIFTY:NSE', 'Nifty 50', yahooContext.nifty50),
      this.fetchMacroQuote('NIFTYBANK:NSE', 'Bank Nifty', yahooContext.bankNifty),
      this.fetchMacroQuote('INDIAVIX:NSE', 'India VIX', yahooContext.indiaVix),
      this.fetchMacroQuote('WTI', 'Crude Oil ($/bbl)', yahooContext.brentCrude),
    ]);

    const giftNifty: IndexQuote = {
      symbol: 'GIFTNIFTY',
      name: 'GIFT Nifty',
      price: null,
      previousClose: null,
      change: null,
      changePct: null,
      timestamp: nifty50.timestamp,
      source: 'Twelve Data (Unavailable)',
      note:
        nifty50.changePct !== null
          ? `Direct GIFT Nifty feed unavailable; Nifty 50 ${nifty50.changePct >= 0 ? '+' : ''}${nifty50.changePct.toFixed(2)}%`
          : 'Direct GIFT Nifty feed unavailable',
    };

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
    if (indiaVix.price !== null && indiaVix.price >= 20) {
      riskScore -= 1;
      drivers.push(`India VIX elevated (${indiaVix.price.toFixed(2)})`);
    }
    if (brentCrude.changePct !== null && brentCrude.changePct > 2.5) {
      riskScore -= 1;
      drivers.push(`Crude spike +${brentCrude.changePct.toFixed(2)}%`);
    }
    if (usdInr.changePct !== null && usdInr.changePct > 0.35) {
      riskScore -= 1;
      drivers.push(`INR weakening +${usdInr.changePct.toFixed(2)}%`);
    }

    const riskRegime =
      riskScore >= 1 ? 'RISK_ON' : riskScore <= -1 ? 'RISK_OFF' : 'NEUTRAL';

    return {
      giftNifty,
      nifty50,
      bankNifty,
      indiaVix,
      usClose,
      brentCrude,
      usdInr,
      riskRegime,
      riskRationale:
        drivers.length > 0
          ? drivers.join(' · ')
          : 'Mixed macro cues across US close, VIX, crude, and INR',
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
    const fallbackNeeded: UniverseMeta[] = [];

    // Fetch in small batches to respect Twelve Data per-minute credit rate limits
    const batchSize = 4;
    for (let i = 0; i < universe.length; i += batchSize) {
      const chunk = universe.slice(i, i + batchSize);
      const results = await Promise.all(
        chunk.map(async (meta): Promise<StockMarketSnapshot | null> => {
          const tdSymbol = `${meta.ticker}:NSE`;
          const [quote, dailyTs, intradayTs] = await Promise.all([
            this.fetchTdJson<TwelveDataQuoteResponse>('quote', { symbol: tdSymbol }),
            this.fetchTdJson<TwelveDataTimeSeriesResponse>('time_series', {
              symbol: tdSymbol,
              interval: '1day',
              outputsize: '25',
            }),
            this.fetchTdJson<TwelveDataTimeSeriesResponse>('time_series', {
              symbol: tdSymbol,
              interval: '15min',
              outputsize: '30',
            }),
          ]);

          const dailyBars = parseTwelveDataBars(dailyTs?.values);
          if (!quote || !quote.close || dailyBars.length < 2) {
            return null;
          }

          const all15m = parseTwelveDataBars(intradayTs?.values);
          const intraday15mBars = extractLatestSessionBars(all15m);

          const latestDaily = dailyBars[dailyBars.length - 1];
          const prevDaily = dailyBars[dailyBars.length - 2];

          const price = toNum(quote.close, latestDaily.close);
          const previousClose = toNum(quote.previous_close, prevDaily.close);
          const open = toNum(quote.open, latestDaily.open);
          const high = toNum(quote.high, latestDaily.high);
          const low = toNum(quote.low, latestDaily.low);
          const volume = toNum(quote.volume, latestDaily.volume);

          const historyForAvg =
            dailyBars.length > 20
              ? dailyBars.slice(dailyBars.length - 21, dailyBars.length - 1)
              : dailyBars.slice(0, dailyBars.length - 1);
          const avgVolume20 =
            toNum(quote.average_volume, 0) > 0
              ? toNum(quote.average_volume)
              : historyForAvg.length > 0
                ? historyForAvg.reduce((sum, b) => sum + b.volume, 0) / historyForAvg.length
                : volume;

          const changePct = previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0;
          const gapPct = previousClose > 0 ? ((open - previousClose) / previousClose) * 100 : 0;
          const volumeRatio = avgVolume20 > 0 ? volume / avgVolume20 : 1;

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
            bidAskSpreadPct: null, // Twelve Data standard quote does not include L1 bid-ask spread
            preOpenIndicativePrice: null,
            preOpenIndicativeVolume: null,
            preOpenAvailable: false,
            dailyBars,
            intraday15mBars,
            dataTimestamp: quote.datetime
              ? new Date(quote.datetime).toISOString()
              : new Date().toISOString(),
            source: this.providerName,
          };
        }),
      );

      for (let j = 0; j < chunk.length; j++) {
        const snap = results[j];
        if (snap) {
          snapshots.push(snap);
        } else {
          fallbackNeeded.push(chunk[j]);
        }
      }
    }

    // If any symbols failed due to Twelve Data plan limits or rate limits, cleanly supplement from Yahoo
    let sourceLabel = this.providerName;
    if (fallbackNeeded.length > 0) {
      const fb = await this.yahooFallback.getUniverseSnapshots(fallbackNeeded);
      for (const s of fb.snapshots) {
        snapshots.push(s);
      }
      sourceLabel =
        snapshots.length === fb.snapshots.length
          ? `${fb.source} (Twelve Data unavailable/rate-limited)`
          : `${this.providerName} + Yahoo Fallback (${fallbackNeeded.length} tickers)`;
    }

    return {
      snapshots,
      preOpenAvailable: false,
      source: sourceLabel,
      timestamp: new Date().toISOString(),
    };
  }
}
