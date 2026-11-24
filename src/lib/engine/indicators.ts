import type { ComputedIndicators, OHLCVBar, StockMarketSnapshot } from '../data/types.ts';

/**
 * Computes True Range array and Wilder-smoothed (or SMA fallback) ATR(period).
 */
export function computeAtr(bars: OHLCVBar[], period = 14): number {
  if (bars.length < 2) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i];
    const prevClose = bars[i - 1].close;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose),
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length === 0) return 0;
  if (trueRanges.length <= period) {
    return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
  }

  // Initial SMA for first `period`, then Wilder smoothing
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  return atr;
}

/**
 * Computes session VWAP = sum(typicalPrice * volume) / sum(volume)
 */
export function computeVwap(intradayBars: OHLCVBar[]): number | null {
  if (intradayBars.length === 0) return null;
  let pvSum = 0;
  let volSum = 0;
  for (const bar of intradayBars) {
    if (bar.volume <= 0) continue;
    const typical = (bar.high + bar.low + bar.close) / 3;
    pvSum += typical * bar.volume;
    volSum += bar.volume;
  }
  return volSum > 0 ? pvSum / volSum : null;
}

/**
 * Computes 15-minute Opening Range Breakout levels (first 15m candle high & low).
 */
export function computeOpeningRange(intradayBars: OHLCVBar[]): {
  orbHigh: number | null;
  orbLow: number | null;
} {
  if (intradayBars.length === 0) {
    return { orbHigh: null, orbLow: null };
  }
  const firstBar = intradayBars[0];
  return {
    orbHigh: firstBar.high,
    orbLow: firstBar.low,
  };
}

export function computeStockIndicators(
  snapshot: StockMarketSnapshot,
  niftyChangePct: number,
): ComputedIndicators {
  const atr14Daily = computeAtr(snapshot.dailyBars, 14);
  const atr14DailyPct = snapshot.price > 0 ? (atr14Daily / snapshot.price) * 100 : 0;

  let atr14_15m = 0;
  let atr14_15mSource: '15m_bars' | 'daily_scaled' = 'daily_scaled';
  if (snapshot.intraday15mBars.length >= 6) {
    atr14_15m = computeAtr(snapshot.intraday15mBars, 14);
    atr14_15mSource = '15m_bars';
  }
  if (atr14_15m <= 0) {
    // 25 15m bars per NSE session => sqrt(25) = 5, ~0.25-0.30 of daily ATR
    atr14_15m = atr14Daily > 0 ? atr14Daily * 0.28 : snapshot.price * 0.005;
    atr14_15mSource = 'daily_scaled';
  }

  const vwap = computeVwap(snapshot.intraday15mBars);
  const { orbHigh, orbLow } = computeOpeningRange(snapshot.intraday15mBars);
  const relativeStrengthVsNifty = snapshot.changePct - niftyChangePct;

  return {
    atr14Daily,
    atr14DailyPct,
    atr14_15m,
    atr14_15mSource,
    vwap,
    orbHigh,
    orbLow,
    relativeStrengthVsNifty,
  };
}
