import { ArrowRight } from 'lucide-react';
import type { ScanResponse } from '../lib/data/types.ts';
import { formatInr, formatIstTimestamp, formatPct } from '../lib/format.ts';
import type { ChecklistItem } from './ChecklistPanel.tsx';
import { SectorRiskExposureWidget } from './SectorRiskExposureWidget.tsx';

interface DashboardOverviewProps {
  scan: ScanResponse;
  totalCapital: number;
  checklist: ChecklistItem[];
  onGoToPreOpen: () => void;
}

export function DashboardOverview({
  scan,
  totalCapital,
  checklist,
  onGoToPreOpen,
}: DashboardOverviewProps) {
  const eligibleCount = scan.candidates.filter((c) => c.eligibleForShortlist).length;
  const freshCatalystCount = scan.candidates.filter((c) => c.catalystStatus === 'FRESH').length;
  const advancers = scan.candidates.filter((c) => c.snapshot.changePct > 0).length;
  const decliners = scan.candidates.filter((c) => c.snapshot.changePct < 0).length;
  const checklistDone = checklist.filter((c) => c.checked).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400">Session State</div>
          <div className="font-display text-lg font-bold text-slate-100 mt-1">
            {scan.session.label}
          </div>
          <div className="font-mono text-xs text-slate-400 mt-1 tabular-nums">
            {scan.session.istTimeDisplay} · {scan.session.istDateDisplay}
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400">Universe Breadth ({scan.candidates.length})</div>
          <div className="font-mono text-lg font-bold text-slate-100 mt-1 tabular-nums">
            <span className="text-emerald-400">{advancers} Adv</span>
            <span className="text-slate-600 mx-2">/</span>
            <span className="text-rose-400">{decliners} Dec</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {eligibleCount} passed hard-fail gates
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400">Fresh Catalysts Found</div>
          <div className="font-mono text-lg font-bold text-amber-300 mt-1 tabular-nums">
            {freshCatalystCount} Stocks
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {scan.newsFeedCount} RSS items scanned ({scan.newsSource})
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400">Pre-Market Checklist</div>
          <div className="font-mono text-lg font-bold text-slate-100 mt-1 tabular-nums">
            {checklistDone} / {checklist.length} Done
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Macro Regime: {scan.marketContext.riskRegime.replace('_', '-')}
          </div>
        </div>
      </div>

      <SectorRiskExposureWidget
        shortlist={scan.shortlist}
        totalCapital={totalCapital}
        onGoToPreOpen={onGoToPreOpen}
      />

      <section className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-200">
              Current Top Shortlist Snapshot
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Source: {scan.dataSource} · Timestamp: <span className="font-mono">{formatIstTimestamp(scan.generatedAt)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToPreOpen}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            Open Full Scanner
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0E1420] text-[11px] font-semibold text-slate-400">
                <th className="py-2.5 px-4">Rank</th>
                <th className="py-2.5 px-4">Stock</th>
                <th className="py-2.5 px-4">Direction</th>
                <th className="py-2.5 px-4 text-right">Entry</th>
                <th className="py-2.5 px-4 text-right">Stop Loss</th>
                <th className="py-2.5 px-4 text-right">Target (1:2)</th>
                <th className="py-2.5 px-4 text-right">Qty</th>
                <th className="py-2.5 px-4 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {scan.shortlist.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400">
                    No eligible stocks passed current filter thresholds.
                  </td>
                </tr>
              ) : (
                scan.shortlist.map((item) => (
                  <tr key={item.evaluation.snapshot.meta.symbol} className="hover:bg-slate-800/35">
                    <td className="py-2.5 px-4 font-mono text-amber-400">#{item.rank}</td>
                    <td className="py-2.5 px-4">
                      <span className="font-semibold text-slate-100">
                        {item.evaluation.snapshot.meta.ticker}
                      </span>
                      <span className="text-slate-400 ml-2">
                        ({formatPct(item.evaluation.snapshot.changePct)})
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold">
                      <span
                        className={
                          item.sizing.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
                        }
                      >
                        {item.sizing.direction}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-100">
                      {formatInr(item.sizing.entry)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-400">
                      {formatInr(item.sizing.stopLoss)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-400">
                      {formatInr(item.sizing.target)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-300">
                      {item.sizing.quantity}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-100">
                      {item.evaluation.totalScore}/10
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
