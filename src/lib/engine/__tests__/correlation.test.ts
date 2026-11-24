import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { OHLCVBar, StockEvaluation, StockMarketSnapshot } from '../../data/types.ts';
import {
  buildDailyReturnMap,
  computePearsonCorrelation,
  computeShortlistCorrelationMatrix,
} from '../correlation.ts';
import { evaluateUniverse } from '../scoring.ts';

function barsFromReturns(returns: number[], startPrice = 100): OHLCVBar[] {
  const baseDay = Date.UTC(2026, 9, 1, 9, 15);
  const bars: OHLCVBar[] = [
    {
      timestamp: baseDay,
      open: startPrice,
      high: startPrice * 1.01,
      low: startPrice * 0.99,
      close: startPrice,
      volume: 2_000_000,
    },
  ];

  let price = startPrice;
  for (let i = 0; i < returns.length; i++) {
    price = price * (1 + returns[i]);
    bars.push({
      timestamp: baseDay + (i + 1) * 86_400_000,
      open: price,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 2_000_000,
    });
  }
  return bars;
}

function makeEval(ticker: string, sector: string, returns: number[]): StockEvaluation {
  const dailyBars = barsFromReturns(returns);
  const lastClose = dailyBars[dailyBars.length - 1].close;
  const snap: StockMarketSnapshot = {
    meta: {
      symbol: `${ticker}.NS`,
      ticker,
      name: `${ticker} Ltd`,
      sector,
      aliases: [ticker.toLowerCase()],
      circuitBandPct: 20,
      isT2T: false,
      freeFloatPct: 50,
      isFnO: true,
    },
    price: lastClose,
    previousClose: dailyBars[dailyBars.length - 2].close,
    open: lastClose,
    high: lastClose * 1.01,
    low: lastClose * 0.99,
    volume: 3_000_000,
    avgVolume20: 2_000_000,
    changePct: returns[returns.length - 1] * 100,
    gapPct: 0.2,
    volumeRatio: 1.5,
    bidAskSpreadPct: 0.03,
    preOpenIndicativePrice: null,
    preOpenIndicativeVolume: null,
    preOpenAvailable: false,
    dailyBars,
    intraday15mBars: [],
    dataTimestamp: new Date().toISOString(),
    source: 'Test',
  };

  return evaluateUniverse([snap], 0, [])[0];
}

describe('Shortlist Correlation Matrix', () => {
  it('computes +1.00 for identical returns and -1.00 for exact inverse returns', () => {
    const rPos = [0.01, -0.02, 0.015, -0.005, 0.02, -0.01, 0.012];
    const rNeg = rPos.map((x) => -x);

    const mapA = buildDailyReturnMap(barsFromReturns(rPos));
    const mapB = buildDailyReturnMap(barsFromReturns(rPos));
    const mapC = buildDailyReturnMap(barsFromReturns(rNeg));

    assert.equal(computePearsonCorrelation(mapA, mapB).r, 1);
    assert.equal(computePearsonCorrelation(mapA, mapC).r, -1);
  });

  it('flags high concentration when shortlisted stocks co-move strongly or cluster in one sector', () => {
    const base = [0.012, -0.015, 0.021, -0.008, 0.017, -0.011, 0.009, 0.014];
    const slightVariation = [0.011, -0.014, 0.02, -0.007, 0.016, -0.01, 0.01, 0.013];
    const inverse = base.map((x) => -x * 0.8);

    const ev1 = makeEval('SBIN', 'Banking', base);
    const ev2 = makeEval('AXISBANK', 'Banking', slightVariation);
    const ev3 = makeEval('INFY', 'IT', inverse);

    const result = computeShortlistCorrelationMatrix([ev1, ev2, ev3]);
    assert.ok(result !== null);
    assert.equal(result.tickers.length, 3);
    assert.equal(result.matrix[0][0], 1);
    assert.ok((result.matrix[0][1] ?? 0) > 0.95);
    assert.ok((result.matrix[0][2] ?? 0) < -0.95);
    assert.equal(result.sameSectorClusters.length, 1);
    assert.equal(result.sameSectorClusters[0].sector, 'Banking');
    assert.ok(result.highCorrelationPairs.length >= 2);
    assert.equal(result.concentrationLevel, 'HIGH_CONCENTRATION');
  });

  it('returns null when fewer than 2 stocks are shortlisted', () => {
    const ev = makeEval('TCS', 'IT', [0.01, 0.02, -0.01, 0.005, 0.01]);
    assert.equal(computeShortlistCorrelationMatrix([ev]), null);
  });
});
