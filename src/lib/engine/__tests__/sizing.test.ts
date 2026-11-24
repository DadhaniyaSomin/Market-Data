import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CapitalConfig, StockEvaluation, StockMarketSnapshot } from '../../data/types.ts';
import { evaluateUniverse } from '../scoring.ts';
import { computePositionSizing } from '../sizing.ts';

function buildEvaluation(price: number, atr15m: number, orbLow: number, direction: 'LONG' | 'SHORT' = 'LONG'): StockEvaluation {
  const dailyBars = Array.from({ length: 20 }, (_, i) => ({
    timestamp: Date.now() - (20 - i) * 86400_000,
    open: price,
    high: price * 1.01,
    low: price * 0.99,
    close: price,
    volume: 2_500_000,
  }));

  const intraday15mBars = Array.from({ length: 8 }, (_, i) => ({
    timestamp: Date.now() - (8 - i) * 900_000,
    open: price,
    high: price + atr15m * 0.5,
    low: i === 0 ? orbLow : price - atr15m * 0.5,
    close: direction === 'LONG' ? price + 2 : price - 2,
    volume: 200_000,
  }));

  const snap: StockMarketSnapshot = {
    meta: {
      symbol: 'SBIN.NS',
      ticker: 'SBIN',
      name: 'State Bank of India',
      sector: 'Banking',
      aliases: ['sbi'],
      circuitBandPct: 20,
      isT2T: false,
      freeFloatPct: 42.5,
      isFnO: true,
    },
    price,
    previousClose: price * 0.99,
    open: price * 0.995,
    high: price * 1.01,
    low: orbLow,
    volume: 5_000_000,
    avgVolume20: 2_500_000,
    changePct: direction === 'LONG' ? 1.5 : -1.5,
    gapPct: 0.5,
    volumeRatio: 2.0,
    bidAskSpreadPct: 0.03,
    preOpenIndicativePrice: null,
    preOpenIndicativeVolume: null,
    preOpenAvailable: false,
    dailyBars,
    intraday15mBars,
    dataTimestamp: new Date().toISOString(),
    source: 'Test',
  };

  const [evaluation] = evaluateUniverse([snap], 0, []);
  evaluation.direction = direction;
  evaluation.indicators.atr14_15m = atr15m;
  evaluation.indicators.atr14_15mSource = '15m_bars';
  evaluation.indicators.orbLow = orbLow;
  return evaluation;
}

describe('Position Sizing & Capital Cap', () => {
  it('computes exact risk_amount, quantity, 1:2 target, and applies 1.5x capital cap when exceeded', () => {
    const evalStock = buildEvaluation(1000, 10, 980, 'LONG');
    const capitalConfig: CapitalConfig = {
      totalCapital: 100_000,
      riskPerTradePct: 1.0, // risk_amount = 1,000
      maxStocks: 4, // max_capital_per_stock = (100,000 / 4) * 1.5 = 37,500
      directionMode: 'BOTH',
    };

    const sizing = computePositionSizing(evalStock, capitalConfig, 4);

    // 1x ATR(15m) = 10 -> stop = 990 (tighter than ORB low 980)
    assert.equal(sizing.entry, 1000);
    assert.equal(sizing.stopLoss, 990);
    assert.equal(sizing.riskPerShare, 10);
    assert.equal(sizing.target, 1020); // 1:2 R:R
    assert.equal(sizing.rawRiskAmount, 1000);
    assert.equal(sizing.rawQuantity, 100); // floor(1000 / 10) = 100 -> 100 * 1000 = 100,000 > 37,500
    assert.equal(sizing.capitalCapped, true);
    assert.equal(sizing.maxCapitalPerStock, 37_500);
    assert.equal(sizing.quantity, 37); // floor(37,500 / 1000)
    assert.equal(sizing.capitalUsed, 37_000);
    assert.equal(sizing.plannedRisk, 370);
    assert.ok(sizing.estimatedCharges > 0);
  });

  it('does not cap quantity when capital used is within 1.5x per-stock allocation', () => {
    const evalStock = buildEvaluation(500, 12, 480, 'LONG');
    const capitalConfig: CapitalConfig = {
      totalCapital: 500_000,
      riskPerTradePct: 1.0, // risk_amount = 5,000
      maxStocks: 4, // max_capital_per_stock = 187,500
      directionMode: 'BOTH',
    };

    const sizing = computePositionSizing(evalStock, capitalConfig, 4);

    // riskPerShare = 12 -> rawQuantity = floor(5000 / 12) = 416 -> 416 * 500 = 208,000 > 187,500 (capped to 375)
    // Test with wider stop 20 -> rawQuantity = 250 -> 250 * 500 = 125,000 <= 187,500
    const evalWider = buildEvaluation(500, 20, 470, 'LONG');
    const sizingUncapped = computePositionSizing(evalWider, capitalConfig, 4);

    assert.equal(sizingUncapped.capitalCapped, false);
    assert.equal(sizingUncapped.quantity, 250);
    assert.equal(sizingUncapped.capitalUsed, 125_000);
    assert.equal(sizingUncapped.plannedRisk, 5_000);
    assert.equal(sizingUncapped.target, 540);
    assert.ok(sizing.capitalCapped);
  });

  it('chooses ORB Low stop when tighter than ATR stop and >= 0.5% logical buffer', () => {
    const evalStock = buildEvaluation(300, 2.5, 298.0, 'LONG');
    const capitalConfig: CapitalConfig = {
      totalCapital: 200_000,
      riskPerTradePct: 1.0,
      maxStocks: 4,
      directionMode: 'BOTH',
    };

    const sizing = computePositionSizing(evalStock, capitalConfig, 4);
    // orbLow = 298.0 -> orbStop = 297.95 (risk 2.05 = 0.68% >= 0.5%), tighter than atrStop (300 - 2.5 = 297.5)
    assert.equal(sizing.stopLoss, 297.95);
    assert.equal(sizing.riskPerShare, 2.05);
    assert.equal(sizing.target, 304.1);
    assert.ok(sizing.stopLossMethod.includes('ORB Low'));
  });
});
