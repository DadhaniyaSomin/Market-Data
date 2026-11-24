import { useMemo, useState } from 'react';
import { AlertTriangle, Layers, ShieldCheck } from 'lucide-react';
import type { ShortlistItem } from '../lib/data/types.ts';
import {
  computePortfolioSectorRisk,
  SECTOR_OVER_CONCENTRATION_RISK_PCT,
  type SectorExposureStatus,
} from '../lib/engine/portfolioRisk.ts';
import { formatInr } from '../lib/format.ts';

interface SectorRiskExposureWidgetProps {
  shortlist: ShortlistItem[];
  totalCapital: number;
  onGoToPreOpen?: () => void;
}

type ExposureMetricMode = 'RISK' | 'CAPITAL';

const SECTOR_BAR_COLORS = [
  'bg-amber-400',
  'bg-sky-400',
  'bg-emerald-400',
  'bg-violet-400',
  'bg-rose-400',
  'bg-slate-400',
];

const SECTOR_DOT_COLORS = [
  'bg-amber-400',
  'bg-sky-400',
  'bg-emerald-400',
  'bg-violet-400',
  'bg-rose-400',
  'bg-slate-400',
];

function getRowStatusDisplay(status: SectorExposureStatus): {
  label: string;
  textClass: string;
} {
  if (status === 'OVER_CONCENTRATED') {
    return {
      label: `Over-Concentrated (>=${SECTOR_OVER_CONCENTRATION_RISK_PCT}%)`,
      textClass: 'text-rose-300',
    };
  }
  if (status === 'ELEVATED') {
    return {
      label: 'Elevated Weight',
      textClass: 'text-amber-300',
    };
  }
  return {
    label: 'Balanced',
    textClass: 'text-emerald-300',
  };
}

export function SectorRiskExposureWidget({
  shortlist,
  totalCapital,
  onGoToPreOpen,
}: SectorRiskExposureWidgetProps) {
  const [metricMode, setMetricMode] = useState<ExposureMetricMode>('RISK');

  const summary = useMemo(
    () => computePortfolioSectorRisk(shortlist, totalCapital),
    [shortlist, totalCapital],
  );

  const sortedSectors = useMemo(() => {
    const copy = [...summary.sectors];
    if (metricMode === 'CAPITAL') {
      copy.sort((a, b) => b.capitalDeployed - a.capitalDeployed);
    } else {
      copy.sort((a, b) => b.plannedRisk - a.plannedRisk);
    }
    return copy;
  }, [summary.sectors, metricMode]);

  const headerStatus =
    summary.overallStatus === 'OVER_CONCENTRATED'
      ? {
          label: 'Industry Over-Concentration',
          className: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
          Icon: AlertTriangle,
        }
      : summary.overallStatus === 'ELEVATED' || summary.overallStatus === 'SINGLE_SETUP'
        ? {
            label:
              summary.overallStatus === 'SINGLE_SETUP' ? 'Single Sector' : 'Elevated Overlap',
            className: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
            Icon: AlertTriangle,
          }
        : summary.overallStatus === 'BALANCED'
          ? {
              label: 'Balanced Exposure',
              className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
              Icon: ShieldCheck,
            }
          : {
              label: 'No Active Risk',
              className: 'bg-slate-800 text-slate-300 border-slate-700',
              Icon: Layers,
            };

  const StatusIcon = headerStatus.Icon;

  return (
    <section
      aria-label="Portfolio risk exposure by sector"
      className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="space-y-1">
          <h2 className="font-display text-sm font-semibold text-slate-100">
            Portfolio Risk Exposure by Sector
          </h2>
          <p className="text-xs text-slate-400">
            Active shortlist ({summary.totalSetups} setups across {summary.sectorCount} industries)
            <span aria-hidden="true"> · </span>
            Total Planned Risk:{' '}
            <span className="font-mono text-slate-200 tabular-nums">
              {formatInr(summary.totalPlannedRisk)}
            </span>{' '}
            <span className="font-mono text-slate-400 tabular-nums">
              ({summary.portfolioRiskPctOfCapital.toFixed(2)}% of capital)
            </span>
            <span aria-hidden="true"> · </span>
            Deployed:{' '}
            <span className="font-mono text-slate-200 tabular-nums">
              {formatInr(summary.totalCapitalDeployed, 0)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div
            className="flex items-center gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-md"
            role="group"
            aria-label="Exposure breakdown basis"
          >
            <button
              type="button"
              onClick={() => setMetricMode('RISK')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                metricMode === 'RISK'
                  ? 'bg-slate-800 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              By Risk (₹)
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('CAPITAL')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                metricMode === 'CAPITAL'
                  ? 'bg-slate-800 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              By Capital (₹)
            </button>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-semibold rounded border whitespace-nowrap shrink-0 ${headerStatus.className}`}
          >
            <StatusIcon className="w-3.5 h-3.5" />
            <span>{headerStatus.label}</span>
          </span>
        </div>
      </div>

      {/* Empty State */}
      {summary.totalSetups === 0 ? (
        <div className="py-6 text-center space-y-2">
          <p className="text-xs text-slate-400">
            No shortlisted setups currently carry active risk. Adjust scanner thresholds or direction mode to populate sector exposure.
          </p>
          {onGoToPreOpen && (
            <button
              type="button"
              onClick={onGoToPreOpen}
              className="px-3.5 py-2 text-xs font-semibold rounded-md bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700 transition-colors whitespace-nowrap"
            >
              Review Pre-Open Scanner
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Over-concentration Alert or Concise Summary */}
          {summary.overConcentratedSectors.length > 0 ? (
            <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold text-rose-100">
                  Concentration Warning: {summary.overConcentratedSectors.map((s) => s.sector).join(', ')}
                </div>
                <p className="text-rose-200/90 leading-relaxed">
                  {summary.concentrationSummary} Consider trimming one correlated setup or reducing position size in that sector before 09:15 IST.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400">
              {summary.concentrationSummary}
            </div>
          )}

          {/* Stacked Sector Risk/Capital Distribution Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                {metricMode === 'RISK'
                  ? 'Share of Total Shortlist Planned Risk (%)'
                  : 'Share of Total Capital Deployed (%)'}
              </span>
              <span className="font-mono tabular-nums text-slate-300">
                100% ({summary.sectorCount} {summary.sectorCount === 1 ? 'sector' : 'sectors'})
              </span>
            </div>

            <div
              className="h-3 w-full rounded bg-[#0B0F17] border border-slate-800 overflow-hidden flex"
              role="img"
              aria-label="Stacked bar chart of portfolio exposure by sector"
            >
              {sortedSectors.map((bucket, idx) => {
                const share =
                  metricMode === 'RISK' ? bucket.riskSharePct : bucket.capitalSharePct;
                const colorClass = SECTOR_BAR_COLORS[idx % SECTOR_BAR_COLORS.length];
                return (
                  <div
                    key={bucket.sector}
                    style={{ width: `${Math.max(share, 1)}%` }}
                    className={`${colorClass} h-full border-r border-[#0B0F17] last:border-r-0 transition-all`}
                    title={`${bucket.sector}: ${share.toFixed(1)}%`}
                  />
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-300">
              {sortedSectors.map((bucket, idx) => {
                const share =
                  metricMode === 'RISK' ? bucket.riskSharePct : bucket.capitalSharePct;
                const dotColor = SECTOR_DOT_COLORS[idx % SECTOR_DOT_COLORS.length];
                return (
                  <div key={bucket.sector} className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-xs ${dotColor}`} aria-hidden="true" />
                    <span className="font-medium text-slate-200">{bucket.sector}</span>
                    <span className="font-mono tabular-nums text-slate-400">
                      {share.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sector Exposure Breakdown Table */}
          <div className="overflow-x-auto border border-slate-800/80 rounded-md">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0E1420] text-[11px] font-semibold text-slate-400">
                  <th className="py-2.5 px-3.5">Industry &amp; Setups</th>
                  <th className="py-2.5 px-3.5 text-right">Trades</th>
                  <th className="py-2.5 px-3.5">
                    {metricMode === 'RISK' ? 'Risk Share' : 'Capital Share'}
                  </th>
                  <th className="py-2.5 px-3.5 text-right">Planned Risk</th>
                  <th className="py-2.5 px-3.5 text-right">Capital Deployed</th>
                  <th className="py-2.5 px-3.5 text-right">Exposure State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {sortedSectors.map((bucket, idx) => {
                  const activeShare =
                    metricMode === 'RISK' ? bucket.riskSharePct : bucket.capitalSharePct;
                  const barColor =
                    bucket.status === 'OVER_CONCENTRATED'
                      ? 'bg-rose-400'
                      : SECTOR_BAR_COLORS[idx % SECTOR_BAR_COLORS.length];
                  const statusInfo = getRowStatusDisplay(bucket.status);

                  return (
                    <tr key={bucket.sector} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3.5">
                        <div className="font-semibold text-slate-100">{bucket.sector}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {bucket.tickers
                            .map((t) => `${t.ticker} (${t.direction})`)
                            .join(' · ')}
                        </div>
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        <div>{bucket.stockCount}</div>
                        <div className="text-[10px] text-slate-400">
                          {bucket.longCount}L / {bucket.shortCount}S
                        </div>
                      </td>

                      <td className="py-2.5 px-3.5 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#0B0F17] rounded overflow-hidden">
                            <div
                              className={`h-full ${barColor}`}
                              style={{ width: `${Math.min(100, activeShare)}%` }}
                            />
                          </div>
                          <span className="font-mono tabular-nums text-slate-200 w-12 text-right">
                            {activeShare.toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-slate-100">
                          {formatInr(bucket.plannedRisk)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {bucket.riskOfTotalCapitalPct.toFixed(2)}% cap
                        </div>
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="text-slate-200">
                          {formatInr(bucket.capitalDeployed, 0)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {bucket.capitalSharePct.toFixed(1)}% deployed
                        </div>
                      </td>

                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        <span className={`font-mono text-[11px] font-semibold ${statusInfo.textClass}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono tabular-nums pt-0.5">
            <span>
              Over-concentration threshold: &ge;{SECTOR_OVER_CONCENTRATION_RISK_PCT}% of total planned risk in one industry
            </span>
            <span>
              Capital Utilization: {summary.capitalUtilizationPct.toFixed(1)}% of{' '}
              {formatInr(totalCapital, 0)} · Est. MIS Charges: ~{formatInr(summary.totalEstimatedCharges)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
