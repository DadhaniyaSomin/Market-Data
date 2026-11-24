import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { OHLCVBar, StockMarketSnapshot, UniverseMeta } from '../../data/types.ts';
import { DEFAULT_FILTER_CONFIG, evaluateFivePointFilter } from '../filters.ts';
import { computeStockIndicators } from '../indicators.ts';
import { computeSectorBreadth, evaluateUniverse, selectTopShortlist } from '../scoring.ts';

function makeDailyBars(count: number, basePrice: number, dailyRangePct: number): OHLCVBar[] {
  const bars: OHLCVBar[] = [];
  const start = Date.now() - count * 86400_000;
  for (let i = 0; i < count; i++) {
    const close = basePrice;
    const halfRange = (basePrice * (dailyRangePct / 100)) / 2;
    bars.push({
      timestamp: start + i * 86400_000,
      open: close,
      high: close + halfRange,
      low: close - halfRange,
      close,
      volume: 2_500_000,
    });
  }
  return bars;
}

function make15mBars(basePrice: number, trendUp: boolean): OHLCVBar[] {
  const bars: OHLCVBar[] = [];
  const start = Date.now() - 8 * 15 * 60_000;
  for (let i = 0; i < 8; i++) {
    const step = trendUp ? i * 1.5 : -i * 1.5;
    const open = basePrice + step;
    const close = open + (trendUp ? 1.2 : -1.2);
    bars.push({
      timestamp: start + i * 15 * 60_000,
      open,
      high: Math.max(open, close) + 1.0,
      low: Math.min(open, close) - 1.0,
      close,
      volume: 200_000,
    });
  }
  return bars;
}

function makeSnapshot(overrides: Partial<StockMarketSnapshot> = {}, metaOverrides: Partial<UniverseMeta> = {}): StockMarketSnapshot {
  const meta: UniverseMeta = {
    symbol: 'TEST.NS',
    ticker: 'TEST',
    name: 'Test Corp Ltd',
    sector: 'IT',
    aliases: ['test corp'],
    circuitBandPct: 20,
    isT2T: false,
    freeFloatPct: 60,
    isFnO: true,
    ...metaOverrides,
  };

  return {
    meta,
    price: 1012,
    previousClose: 995,
    open: 1000,
    high: 1015,
    low: 998,
    volume: 4_500_000,
    avgVolume20: 2_400_000,
    changePct: 1.71,
    gapPct: 0.5,
    volumeRatio: 1.875,
    bidAskSpreadPct: 0.04,
    preOpenIndicativePrice: null,
    preOpenIndicativeVolume: null,
    preOpenAvailable: false,
    dailyBars: makeDailyBars(22, 1000, 2.0),
    intraday15mBars: make15mBars(1000, true),
    dataTimestamp: new Date().toISOString(),
    source: 'Test',
    ...overrides,
  };
}

describe('5-Point Deterministic Filter & Scoring', () => {
  it('scores a clean high-liquidity stock with 2% ATR, fresh catalyst, and aligned technicals 10/10', () => {
    const snap = makeSnapshot();
    const indicators = computeStockIndicators(snap, 0.2);
    const res = evaluateFivePointFilter(snap, indicators, [], DEFAULT_FILTER_CONFIG);

    assert.equal(res.criteria.liquidity.score, 2);
    assert.equal(res.criteria.volatility.score, 2);
    assert.equal(res.criteria.restrictions.score, 2);
    assert.equal(res.criteria.catalyst.score, 2);
    assert.equal(res.criteria.technical.score, 2);
    assert.equal(res.catalystStatus, 'FRESH');
    assert.equal(res.direction, 'LONG');
  });

  it('marks catalyst as PRICED_IN when move exceeds 3%', () => {
    const snap = makeSnapshot({ changePct: 4.2, price: 1042 });
    const indicators = computeStockIndicators(snap, 0.2);
    const res = evaluateFivePointFilter(snap, indicators, [], DEFAULT_FILTER_CONFIG);

    assert.equal(res.catalystStatus, 'PRICED_IN');
    assert.equal(res.criteria.catalyst.pass, false);
    assert.equal(res.criteria.catalyst.score, 1);
  });

  it('hard-fails liquidity when avgVolume20 is below threshold or spread >= 0.1%', () => {
    const lowVolSnap = makeSnapshot({ avgVolume20: 250_000 });
    const wideSpreadSnap = makeSnapshot({ bidAskSpreadPct: 0.15 });

    const [evalLowVol, evalWideSpread] = evaluateUniverse([lowVolSnap, wideSpreadSnap], 0, []);
    assert.equal(evalLowVol.hardFailLiquidity, true);
    assert.equal(evalLowVol.eligibleForShortlist, false);
    assert.equal(evalWideSpread.hardFailLiquidity, true);
    assert.equal(evalWideSpread.eligibleForShortlist, false);
  });

  it('hard-fails restrictions for T2T, 5% circuit band, low free float, or price below minimum', () => {
    const t2t = makeSnapshot({}, { ticker: 'T2T', symbol: 'T2T.NS', isT2T: true });
    const circuit5 = makeSnapshot({}, { ticker: 'CIR5', symbol: 'CIR5.NS', circuitBandPct: 5 });
    const lowFF = makeSnapshot({}, { ticker: 'LOWFF', symbol: 'LOWFF.NS', freeFloatPct: 12 });
    const penny = makeSnapshot({ price: 65 }, { ticker: 'PENNY', symbol: 'PENNY.NS' });

    const evals = evaluateUniverse([t2t, circuit5, lowFF, penny], 0, []);
    for (const ev of evals) {
      assert.equal(ev.hardFailRestrictions, true);
      assert.equal(ev.eligibleForShortlist, false);
    }

    const shortlist = selectTopShortlist(evals, 4);
    assert.equal(shortlist.length, 0);
  });

  it('filters shortlist strictly to LONG setups when directionMode is LONG_ONLY and aggregates sector breadth', () => {
    const longSnap = makeSnapshot(
      { changePct: 1.8, price: 1018 },
      { ticker: 'INFY', symbol: 'INFY.NS', sector: 'IT' },
    );
    const shortSnap = makeSnapshot(
      {
        price: 985,
        changePct: -2.0,
        intraday15mBars: make15mBars(1000, false),
      },
      { ticker: 'SBIN', symbol: 'SBIN.NS', sector: 'Banking' },
    );

    const evals = evaluateUniverse([longSnap, shortSnap], 0, []);
    const both = selectTopShortlist(evals, 4, 'BOTH');
    const longOnly = selectTopShortlist(evals, 4, 'LONG_ONLY');

    assert.equal(both.length, 2);
    assert.equal(longOnly.length, 1);
    assert.equal(longOnly[0].snapshot.meta.ticker, 'INFY');

    const breadth = computeSectorBreadth(evals);
    assert.equal(breadth.length, 2);
    assert.equal(breadth[0].sector, 'IT');
    assert.equal(breadth[0].avgChangePct, 1.8);
    assert.equal(breadth[1].sector, 'Banking');
    assert.equal(breadth[1].avgChangePct, -2.0);
  });
});
