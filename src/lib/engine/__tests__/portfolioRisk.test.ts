import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ShortlistItem, StockEvaluation } from '../../data/types.ts';
import { computePortfolioSectorRisk } from '../portfolioRisk.ts';

function makeShortlistItem(
  rank: number,
  ticker: string,
  sector: string,
  direction: 'LONG' | 'SHORT',
  plannedRisk: number,
  capitalUsed: number,
): ShortlistItem {
  const evaluation = {
    snapshot: {
      meta: {
        symbol: `${ticker}.NS`,
        ticker,
        name: `${ticker} Ltd`,
        sector,
        freeFloatPct: 50,
        isT2T: false,
        circuitBandPct: 20,
      },
    },
  } as unknown as StockEvaluation;

  return {
    rank,
    evaluation,
    sizing: {
      direction,
      entry: 1000,
      stopLoss: direction === 'LONG' ? 990 : 1010,
      stopLossMethod: '0.3x Daily ATR / 0.5% floor',
      target: direction === 'LONG' ? 1020 : 980,
      riskPerShare: 10,
      rawRiskAmount: 5000,
      rawQuantity: 10,
      maxCapitalPerStock: 187500,
      capitalCapped: false,
      quantity: Math.round(capitalUsed / 1000),
      plannedRisk,
      capitalUsed,
      estimatedCharges: 12.5,
      chargesBreakdown: {
        brokerage: 5,
        stt: 2,
        exchangeTxn: 1,
        sebi: 0.5,
        stampDuty: 1,
        gst: 3,
      },
    },
    aiRationale: null,
  };
}

describe('Portfolio Sector Risk Exposure', () => {
  it('groups planned risk and capital by sector and flags industry over-concentration', () => {
    const shortlist: ShortlistItem[] = [
      makeShortlistItem(1, 'SBIN', 'Banking', 'SHORT', 320, 45300),
      makeShortlistItem(2, 'KOTAKBANK', 'Banking', 'SHORT', 385, 55300),
      makeShortlistItem(3, 'COALINDIA', 'Metals', 'SHORT', 210, 38200),
      makeShortlistItem(4, 'ITC', 'FMCG', 'LONG', 185, 30100),
    ];

    const result = computePortfolioSectorRisk(shortlist, 500_000);

    assert.equal(result.totalSetups, 4);
    assert.equal(result.sectorCount, 3);
    assert.equal(result.totalPlannedRisk, 1100);
    assert.equal(result.overallStatus, 'OVER_CONCENTRATED');
    assert.equal(result.overConcentratedSectors.length, 1);
    assert.equal(result.overConcentratedSectors[0].sector, 'Banking');
    assert.equal(result.overConcentratedSectors[0].stockCount, 2);
    assert.equal(result.overConcentratedSectors[0].shortCount, 2);
    assert.equal(result.overConcentratedSectors[0].plannedRisk, 705);
    assert.equal(result.overConcentratedSectors[0].riskSharePct, 64.1);
  });

  it('reports BALANCED when risk is well spread across distinct industries', () => {
    const shortlist: ShortlistItem[] = [
      makeShortlistItem(1, 'SBIN', 'Banking', 'LONG', 250, 40000),
      makeShortlistItem(2, 'TCS', 'IT', 'LONG', 250, 42000),
      makeShortlistItem(3, 'SUNPHARMA', 'Pharma', 'SHORT', 250, 38000),
      makeShortlistItem(4, 'MARUTI', 'Auto', 'LONG', 250, 41000),
    ];

    const result = computePortfolioSectorRisk(shortlist, 500_000);

    assert.equal(result.overallStatus, 'BALANCED');
    assert.equal(result.overConcentratedSectors.length, 0);
    assert.equal(result.sectorCount, 4);
    assert.ok(result.sectors.every((s) => s.riskSharePct === 25));
    assert.ok(result.sectors.every((s) => s.status === 'BALANCED'));
  });

  it('handles empty shortlist cleanly', () => {
    const result = computePortfolioSectorRisk([], 500_000);

    assert.equal(result.overallStatus, 'EMPTY');
    assert.equal(result.totalPlannedRisk, 0);
    assert.equal(result.sectors.length, 0);
  });
});
