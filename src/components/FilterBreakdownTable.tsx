import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { CriterionEvaluation, StockEvaluation } from '../lib/data/types.ts';
import { formatIstTimestamp } from '../lib/format.ts';

interface FilterBreakdownTableProps {
  evaluations: StockEvaluation[];
  dataSource: string;
  generatedAt: string;
}

function CriterionCell({ c }: { c: CriterionEvaluation }) {
  const statusColor = c.hardFail
    ? 'text-rose-400'
    : c.pass
      ? 'text-emerald-400'
      : c.score === 1
        ? 'text-amber-300'
        : 'text-slate-400';

  return (
    <td className="py-2.5 px-3 align-top min-w-[165px]">
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${statusColor}`}>
          {c.pass ? (
            <Check className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <X className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{c.pass ? 'Pass' : c.hardFail ? 'Hard Fail' : 'Fail'}</span>
        </span>
        <span className="font-mono text-xs text-slate-300 tabular-nums">{c.score}/2</span>
      </div>
      <div className="font-mono text-[11px] text-slate-200 mt-1 tabular-nums">
        {c.actualValue}
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5 leading-snug" title={c.details}>
        {c.thresholdNote}
      </div>
    </td>
  );
}

export function FilterBreakdownTable({
  evaluations,
  dataSource,
  generatedAt,
}: FilterBreakdownTableProps) {
  const [onlyEligible, setOnlyEligible] = useState(false);

  const rows = onlyEligible
    ? evaluations.filter((e) => e.eligibleForShortlist)
    : evaluations;

  return (
    <section
      aria-label="5-point deterministic filter results"
      className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden"
    >
      <div className="p-4 sm:p-5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-200">
            04. 5-Point Deterministic Filter Matrix
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Source: {dataSource} · Timestamp: <span className="font-mono">{formatIstTimestamp(generatedAt)}</span> · Hard-fails on Liquidity or Restrictions disqualify entry.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOnlyEligible(false)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              !onlyEligible
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'bg-[#0B0F17] text-slate-400 hover:text-slate-100 border border-slate-800'
            }`}
          >
            All ({evaluations.length})
          </button>
          <button
            type="button"
            onClick={() => setOnlyEligible(true)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              onlyEligible
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'bg-[#0B0F17] text-slate-400 hover:text-slate-100 border border-slate-800'
            }`}
          >
            Eligible Only ({evaluations.filter((e) => e.eligibleForShortlist).length})
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-[#0E1420] text-[11px] font-semibold text-slate-400">
              <th className="py-2.5 px-3">Stock &amp; Bias</th>
              <th className="py-2.5 px-3">1. Liquidity</th>
              <th className="py-2.5 px-3">2. Volatility (ATR 14)</th>
              <th className="py-2.5 px-3">3. Restrictions</th>
              <th className="py-2.5 px-3">4. Catalyst</th>
              <th className="py-2.5 px-3">5. Technical Setup</th>
              <th className="py-2.5 px-3 text-right">Score &amp; Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {rows.map((ev) => (
              <tr key={ev.snapshot.meta.symbol} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-2.5 px-3 align-top whitespace-nowrap">
                  <div className="text-xs font-semibold text-slate-100">
                    {ev.snapshot.meta.ticker}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {ev.direction} · ₹{ev.snapshot.price.toFixed(2)}
                  </div>
                </td>
                <CriterionCell c={ev.criteria.liquidity} />
                <CriterionCell c={ev.criteria.volatility} />
                <CriterionCell c={ev.criteria.restrictions} />
                <CriterionCell c={ev.criteria.catalyst} />
                <CriterionCell c={ev.criteria.technical} />
                <td className="py-2.5 px-3 align-top text-right whitespace-nowrap">
                  <div className="font-mono text-sm font-bold text-slate-100 tabular-nums">
                    {ev.totalScore}/10
                  </div>
                  <div
                    className={`text-[11px] font-medium mt-0.5 ${
                      ev.eligibleForShortlist ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {ev.eligibleForShortlist ? 'Eligible' : 'Disqualified'}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
