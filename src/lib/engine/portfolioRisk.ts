import type { ShortlistItem } from '../data/types.ts';

export type SectorExposureStatus = 'OVER_CONCENTRATED' | 'ELEVATED' | 'BALANCED';

export interface SectorTickerRisk {
  ticker: string;
  direction: 'LONG' | 'SHORT';
  plannedRisk: number;
  capitalUsed: number;
}

export interface SectorRiskBucket {
  sector: string;
  stockCount: number;
  longCount: number;
  shortCount: number;
  tickers: SectorTickerRisk[];
  plannedRisk: number;
  riskSharePct: number;
  riskOfTotalCapitalPct: number;
  capitalDeployed: number;
  capitalSharePct: number;
  status: SectorExposureStatus;
}

export interface PortfolioSectorRiskSummary {
  totalSetups: number;
  totalPlannedRisk: number;
  totalCapitalDeployed: number;
  totalEstimatedCharges: number;
  portfolioRiskPctOfCapital: number;
  capitalUtilizationPct: number;
  sectorCount: number;
  sectors: SectorRiskBucket[];
  overConcentratedSectors: SectorRiskBucket[];
  topSector: SectorRiskBucket | null;
  overallStatus: 'OVER_CONCENTRATED' | 'ELEVATED' | 'BALANCED' | 'SINGLE_SETUP' | 'EMPTY';
  concentrationSummary: string;
}

export const SECTOR_OVER_CONCENTRATION_RISK_PCT = 40;
export const SECTOR_OVER_CONCENTRATION_CAPITAL_PCT = 45;

/**
 * Aggregates planned rupee risk and deployed capital by sector across the active shortlist
 * to flag over-concentration in any single industry.
 */
export function computePortfolioSectorRisk(
  shortlist: ShortlistItem[],
  totalCapital: number,
  riskThresholdPct = SECTOR_OVER_CONCENTRATION_RISK_PCT,
): PortfolioSectorRiskSummary {
  if (shortlist.length === 0) {
    return {
      totalSetups: 0,
      totalPlannedRisk: 0,
      totalCapitalDeployed: 0,
      totalEstimatedCharges: 0,
      portfolioRiskPctOfCapital: 0,
      capitalUtilizationPct: 0,
      sectorCount: 0,
      sectors: [],
      overConcentratedSectors: [],
      topSector: null,
      overallStatus: 'EMPTY',
      concentrationSummary: 'No active shortlist setups — portfolio risk exposure is ₹0.',
    };
  }

  let totalPlannedRisk = 0;
  let totalCapitalDeployed = 0;
  let totalEstimatedCharges = 0;

  const grouped = new Map<
    string,
    {
      sector: string;
      tickers: SectorTickerRisk[];
      longCount: number;
      shortCount: number;
      plannedRisk: number;
      capitalDeployed: number;
    }
  >();

  for (const item of shortlist) {
    const sector = item.evaluation.snapshot.meta.sector || 'Unclassified';
    const ticker = item.evaluation.snapshot.meta.ticker;
    const { direction, plannedRisk, capitalUsed, estimatedCharges } = item.sizing;

    totalPlannedRisk += plannedRisk;
    totalCapitalDeployed += capitalUsed;
    totalEstimatedCharges += estimatedCharges;

    const existing = grouped.get(sector) ?? {
      sector,
      tickers: [],
      longCount: 0,
      shortCount: 0,
      plannedRisk: 0,
      capitalDeployed: 0,
    };

    existing.tickers.push({
      ticker,
      direction,
      plannedRisk: Number(plannedRisk.toFixed(2)),
      capitalUsed: Number(capitalUsed.toFixed(2)),
    });
    if (direction === 'LONG') existing.longCount += 1;
    else existing.shortCount += 1;
    existing.plannedRisk += plannedRisk;
    existing.capitalDeployed += capitalUsed;

    grouped.set(sector, existing);
  }

  const safeCapital = Math.max(0, totalCapital);
  const isMultiStock = shortlist.length >= 2;

  const sectors: SectorRiskBucket[] = Array.from(grouped.values())
    .map((bucket) => {
      const plannedRisk = Number(bucket.plannedRisk.toFixed(2));
      const capitalDeployed = Number(bucket.capitalDeployed.toFixed(2));
      const riskSharePct =
        totalPlannedRisk > 0
          ? Number(((plannedRisk / totalPlannedRisk) * 100).toFixed(1))
          : 0;
      const capitalSharePct =
        totalCapitalDeployed > 0
          ? Number(((capitalDeployed / totalCapitalDeployed) * 100).toFixed(1))
          : 0;
      const riskOfTotalCapitalPct =
        safeCapital > 0
          ? Number(((plannedRisk / safeCapital) * 100).toFixed(3))
          : 0;

      let status: SectorExposureStatus = 'BALANCED';
      if (isMultiStock) {
        if (
          riskSharePct >= riskThresholdPct ||
          capitalSharePct >= SECTOR_OVER_CONCENTRATION_CAPITAL_PCT
        ) {
          status = 'OVER_CONCENTRATED';
        } else if (riskSharePct >= 30 || bucket.tickers.length >= 2) {
          status = 'ELEVATED';
        }
      } else {
        status = 'ELEVATED';
      }

      return {
        sector: bucket.sector,
        stockCount: bucket.tickers.length,
        longCount: bucket.longCount,
        shortCount: bucket.shortCount,
        tickers: bucket.tickers,
        plannedRisk,
        riskSharePct,
        riskOfTotalCapitalPct,
        capitalDeployed,
        capitalSharePct,
        status,
      };
    })
    .sort((a, b) => {
      if (b.plannedRisk !== a.plannedRisk) return b.plannedRisk - a.plannedRisk;
      if (b.capitalDeployed !== a.capitalDeployed) return b.capitalDeployed - a.capitalDeployed;
      return a.sector.localeCompare(b.sector);
    });

  const overConcentratedSectors = sectors.filter((s) => s.status === 'OVER_CONCENTRATED');
  const elevatedSectors = sectors.filter((s) => s.status === 'ELEVATED');
  const topSector = sectors[0] ?? null;

  let overallStatus: PortfolioSectorRiskSummary['overallStatus'] = 'BALANCED';
  let concentrationSummary = `Portfolio risk is diversified across ${sectors.length} industries with no single sector exceeding ${riskThresholdPct}% of total planned risk.`;

  if (!isMultiStock && topSector) {
    overallStatus = 'SINGLE_SETUP';
    concentrationSummary = `Only 1 active setup (${topSector.tickers[0]?.ticker}) is shortlisted, placing 100% of active risk in ${topSector.sector}.`;
  } else if (overConcentratedSectors.length > 0) {
    overallStatus = 'OVER_CONCENTRATED';
    const lead = overConcentratedSectors[0];
    const tickerList = lead.tickers.map((t) => t.ticker).join(', ');
    concentrationSummary = `Over-concentrated in ${lead.sector}: ${lead.riskSharePct.toFixed(1)}% of total planned risk (${lead.capitalSharePct.toFixed(1)}% of deployed capital) is tied to ${tickerList}.`;
  } else if (elevatedSectors.length > 0 && topSector) {
    overallStatus = 'ELEVATED';
    concentrationSummary = `${topSector.sector} carries the largest share at ${topSector.riskSharePct.toFixed(1)}% of total risk, but remains below the ${riskThresholdPct}% over-concentration threshold.`;
  }

  return {
    totalSetups: shortlist.length,
    totalPlannedRisk: Number(totalPlannedRisk.toFixed(2)),
    totalCapitalDeployed: Number(totalCapitalDeployed.toFixed(2)),
    totalEstimatedCharges: Number(totalEstimatedCharges.toFixed(2)),
    portfolioRiskPctOfCapital:
      safeCapital > 0 ? Number(((totalPlannedRisk / safeCapital) * 100).toFixed(3)) : 0,
    capitalUtilizationPct:
      safeCapital > 0 ? Number(((totalCapitalDeployed / safeCapital) * 100).toFixed(1)) : 0,
    sectorCount: sectors.length,
    sectors,
    overConcentratedSectors,
    topSector,
    overallStatus,
    concentrationSummary,
  };
}
