import { BookOpen, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { JournalEntry, JournalOutcome } from '../lib/data/types.ts';
import { formatInr, formatIstTimestamp } from '../lib/format.ts';

interface JournalViewProps {
  entries: JournalEntry[];
  onUpdateEntry: (id: string, patch: Partial<JournalEntry>) => void;
  onDeleteEntry: (id: string) => void;
  onClearAll: () => void;
}

const OUTCOME_OPTIONS: Array<{ value: JournalOutcome; label: string }> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'TRIGGERED', label: 'Triggered (Open)' },
  { value: 'TARGET_HIT', label: 'Target Hit (1:2)' },
  { value: 'SL_HIT', label: 'SL Hit' },
  { value: 'NO_ENTRY', label: 'No Entry' },
];

export function JournalView({
  entries,
  onUpdateEntry,
  onDeleteEntry,
  onClearAll,
}: JournalViewProps) {
  const [filterOutcome, setFilterOutcome] = useState<'ALL' | JournalOutcome>('ALL');

  const resolved = entries.filter(
    (e) => e.outcome === 'TARGET_HIT' || e.outcome === 'SL_HIT',
  );
  const wins = entries.filter((e) => e.outcome === 'TARGET_HIT').length;
  const winRate = resolved.length > 0 ? (wins / resolved.length) * 100 : null;

  const netPnl = entries.reduce((sum, e) => {
    if (typeof e.realizedPnl === 'number' && Number.isFinite(e.realizedPnl)) {
      return sum + e.realizedPnl;
    }
    return sum;
  }, 0);

  const avgExpectancy = resolved.length > 0 ? netPnl / resolved.length : null;

  const visibleEntries =
    filterOutcome === 'ALL'
      ? entries
      : entries.filter((e) => e.outcome === filterOutcome);

  const handleOutcomeChange = (entry: JournalEntry, outcome: JournalOutcome) => {
    let autoPnl: number | null = entry.realizedPnl;
    if (outcome === 'TARGET_HIT') {
      const reward = Math.abs(entry.target - entry.entry) * entry.quantity;
      autoPnl = Number(reward.toFixed(2));
    } else if (outcome === 'SL_HIT') {
      const loss = -Math.abs(entry.entry - entry.stopLoss) * entry.quantity;
      autoPnl = Number(loss.toFixed(2));
    } else if (outcome === 'NO_ENTRY' || outcome === 'PENDING') {
      autoPnl = null;
    }
    onUpdateEntry(entry.id, { outcome, realizedPnl: autoPnl });
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400">Archived Setups</div>
          <div className="font-mono text-lg font-bold text-slate-100 mt-1 tabular-nums">
            {entries.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {resolved.length} resolved ({wins} Target / {resolved.length - wins} SL)
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400">Realized Win Rate</div>
          <div className="font-mono text-lg font-bold text-emerald-400 mt-1 tabular-nums">
            {winRate !== null ? `${winRate.toFixed(1)}%` : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Target Hit vs SL Hit ratio
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400">Cumulative Net P&amp;L</div>
          <div
            className={`font-mono text-lg font-bold mt-1 tabular-nums ${
              netPnl > 0 ? 'text-emerald-400' : netPnl < 0 ? 'text-rose-400' : 'text-slate-100'
            }`}
          >
            {formatInr(netPnl)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Across logged realized outcomes
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4">
          <div className="text-xs text-slate-400">Expectancy / Resolved Trade</div>
          <div
            className={`font-mono text-lg font-bold mt-1 tabular-nums ${
              avgExpectancy !== null && avgExpectancy > 0
                ? 'text-emerald-400'
                : avgExpectancy !== null && avgExpectancy < 0
                  ? 'text-rose-400'
                  : 'text-slate-100'
            }`}
          >
            {avgExpectancy !== null ? formatInr(avgExpectancy) : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Avg P&amp;L per completed setup
          </div>
        </div>
      </div>

      {/* Archive Table */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-200">
              Trade Journal &amp; Shortlist Archive
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Saved morning shortlists stored locally in your browser. Mark outcomes post-market to track expectancy.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterOutcome}
              onChange={(e) => setFilterOutcome(e.target.value as 'ALL' | JournalOutcome)}
              aria-label="Filter journal by outcome"
              className="px-3 py-1.5 bg-[#0B0F17] border border-slate-700/80 rounded-md text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">All Outcomes ({entries.length})</option>
              {OUTCOME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            {entries.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="px-3 py-1.5 text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-md transition-colors whitespace-nowrap"
              >
                Clear Archive
              </button>
            )}
          </div>
        </div>

        {visibleEntries.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <BookOpen className="w-6 h-6 text-slate-500 mx-auto" />
            <p className="text-sm text-slate-300 font-medium">No journal entries saved yet</p>
            <p className="text-xs text-slate-400">
              Open <strong className="text-slate-200">Intraday Pre-Open</strong> and click <strong className="text-slate-200">Save to Journal</strong> on your shortlist to archive setups here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0E1420] text-[11px] font-semibold text-slate-400">
                  <th className="py-2.5 px-3">Saved Timestamp</th>
                  <th className="py-2.5 px-3">Stock &amp; Side</th>
                  <th className="py-2.5 px-3 text-right">Entry</th>
                  <th className="py-2.5 px-3 text-right">SL / Target</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-3 text-right">Realized P&amp;L (₹)</th>
                  <th className="py-2.5 px-3">Notes</th>
                  <th className="py-2.5 px-3 text-right">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {visibleEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {formatIstTimestamp(entry.savedAt)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-100">
                        {entry.ticker}{' '}
                        <span
                          className={`font-mono text-[11px] ${
                            entry.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {entry.direction}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {entry.sector} · {entry.score}/10
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-100 whitespace-nowrap">
                      {formatInr(entry.entry)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="text-rose-400">{formatInr(entry.stopLoss)}</div>
                      <div className="text-emerald-400">{formatInr(entry.target)}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-300 whitespace-nowrap">
                      {entry.quantity}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <select
                        value={entry.outcome}
                        onChange={(e) =>
                          handleOutcomeChange(entry, e.target.value as JournalOutcome)
                        }
                        aria-label={`Outcome for ${entry.ticker}`}
                        className="px-2 py-1 bg-[#0B0F17] border border-slate-700/80 rounded text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                      >
                        {OUTCOME_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <input
                        type="number"
                        step={10}
                        value={entry.realizedPnl ?? ''}
                        placeholder="0"
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : Number(e.target.value);
                          onUpdateEntry(entry.id, {
                            realizedPnl: val !== null && Number.isFinite(val) ? val : null,
                          });
                        }}
                        aria-label={`Realized P&L for ${entry.ticker}`}
                        className="w-24 px-2 py-1 bg-[#0B0F17] border border-slate-700/80 rounded font-mono text-xs text-right text-slate-100 tabular-nums focus:outline-none focus:border-amber-500"
                      />
                    </td>
                    <td className="py-2.5 px-3 min-w-[180px]">
                      <input
                        type="text"
                        value={entry.notes}
                        placeholder="Add execution note…"
                        onChange={(e) => onUpdateEntry(entry.id, { notes: e.target.value })}
                        className="w-full px-2 py-1 bg-[#0B0F17] border border-slate-700/80 rounded text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteEntry(entry.id)}
                        aria-label={`Delete ${entry.ticker} entry`}
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
