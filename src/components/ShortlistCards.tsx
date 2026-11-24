import { AlertTriangle, Sparkles } from 'lucide-react';
import type { ShortlistItem } from '../lib/data/types.ts';
import { formatInr, formatIstTimestamp, formatPct } from '../lib/format.ts';

interface ShortlistCardsProps {
  shortlist: ShortlistItem[];
  onGenerateRationale: () => void;
  aiLoading: boolean;
  aiError: string | null;
  dataSource: string;
  generatedAt: string;
}

export function ShortlistCards({
  shortlist,
  onGenerateRationale,
  aiLoading,
  aiError,
  dataSource,
  generatedAt,
}: ShortlistCardsProps) {
  return (
    <section aria-label="Final shortlist cards" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-200">
            05. Final Pre-Market Shortlist ({shortlist.length} Ranked Setups)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Source: {dataSource} · Timestamp: <span className="font-mono">{formatIstTimestamp(generatedAt)}</span> · Deterministic 1:2 R:R sizing; AI explains computed numbers only.
          </p>
        </div>

        <button
          type="button"
          onClick={onGenerateRationale}
          disabled={aiLoading || shortlist.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-slate-100 text-slate-950 hover:bg-white disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {aiLoading ? 'Generating AI Rationale…' : 'Generate AI Rationale'}
        </button>
      </div>

      {aiError && (
        <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">AI Rationale Unavailable:</span> {aiError} Showing deterministic shortlist and position sizing without AI narrative.
          </div>
        </div>
      )}

      {shortlist.length === 0 ? (
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-8 text-center text-sm text-slate-400">
          No NSE stocks passed both Liquidity and Restrictions hard-fail checks under your current Settings thresholds. Try relaxing Volume or Minimum Price thresholds in Settings.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {shortlist.map((item) => {
            const { evaluation: ev, sizing, aiRationale } = item;
            const s = ev.snapshot;
            const isLong = sizing.direction === 'LONG';

            return (
              <article
                key={s.meta.symbol}
                className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 flex flex-col justify-between gap-4"
              >
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="font-mono font-semibold text-amber-400">#{item.rank}</span>
                      <span aria-hidden="true">·</span>
                      <span>{s.meta.sector}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">Score {ev.totalScore}/10</span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-slate-100 mt-0.5">
                      {s.meta.ticker}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        {s.meta.name}
                      </span>
                    </h3>
                  </div>

                  <div className="text-right">
                    <span
                      className={`inline-block px-2.5 py-1 text-xs font-mono font-semibold rounded border ${
                        isLong
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/35'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/35'
                      }`}
                    >
                      {sizing.direction}
                    </span>
                    <div className="font-mono text-xs text-slate-400 mt-1 tabular-nums">
                      LTP {formatInr(s.price)} ({formatPct(s.changePct)})
                    </div>
                  </div>
                </div>

                {/* Price Levels & Quantity Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-2.5 bg-[#0B0F17] border border-slate-800 rounded">
                    <div className="text-[11px] text-slate-400">Entry</div>
                    <div className="font-mono text-sm font-semibold text-slate-100 tabular-nums mt-0.5">
                      {formatInr(sizing.entry)}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#0B0F17] border border-slate-800 rounded">
                    <div className="text-[11px] text-slate-400">Stop Loss</div>
                    <div className="font-mono text-sm font-semibold text-rose-400 tabular-nums mt-0.5">
                      {formatInr(sizing.stopLoss)}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#0B0F17] border border-slate-800 rounded">
                    <div className="text-[11px] text-slate-400">Target (1:2)</div>
                    <div className="font-mono text-sm font-semibold text-emerald-400 tabular-nums mt-0.5">
                      {formatInr(sizing.target)}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#0B0F17] border border-slate-800 rounded">
                    <div className="text-[11px] text-slate-400">Quantity</div>
                    <div className="font-mono text-sm font-semibold text-amber-300 tabular-nums mt-0.5">
                      {sizing.quantity} sh
                    </div>
                  </div>
                </div>

                {/* Exact Sizing Working & Charges */}
                <div className="p-3 bg-[#0B0F17] border border-slate-800/80 rounded text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-slate-300">
                    <span>
                      Planned Risk:{' '}
                      <strong className="font-mono text-slate-100 tabular-nums">
                        {formatInr(sizing.plannedRisk)}
                      </strong>
                    </span>
                    <span>
                      Capital Used:{' '}
                      <strong className="font-mono text-slate-100 tabular-nums">
                        {formatInr(sizing.capitalUsed)}
                      </strong>
                    </span>
                    <span>
                      Est. Charges (MIS):{' '}
                      <strong className="font-mono text-slate-200 tabular-nums">
                        ~{formatInr(sizing.estimatedCharges)}
                      </strong>
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-400 leading-relaxed">
                    Working: risk_amt {formatInr(sizing.rawRiskAmount, 0)} / risk_per_share{' '}
                    {formatInr(sizing.riskPerShare)} ({sizing.stopLossMethod}) ={' '}
                    {sizing.rawQuantity} sh
                    {sizing.capitalCapped
                      ? ` -> capped to ${sizing.quantity} sh (max cap ${formatInr(sizing.maxCapitalPerStock, 0)})`
                      : ` -> ${sizing.quantity} sh`}
                  </div>
                </div>

                {/* Matched RSS News (if any) */}
                {ev.matchedNews.length > 0 && (
                  <div className="text-xs space-y-1">
                    <div className="text-[11px] font-semibold text-slate-400">
                      Matched RSS Headlines ({ev.catalystStatus === 'PRICED_IN' ? 'Priced In >3%' : 'Fresh'})
                    </div>
                    <ul className="space-y-1">
                      {ev.matchedNews.slice(0, 2).map((n, idx) => (
                        <li key={idx} className="text-[11px] text-slate-300 truncate">
                          • {n.title}{' '}
                          <span className="text-slate-500">({n.source})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* AI Rationale */}
                <div className="pt-3 border-t border-slate-800/80 text-xs">
                  {aiRationale ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-semibold text-slate-300">AI Decision Rationale</span>
                        <span className="font-mono">
                          {aiRationale.provider} · {aiRationale.model}
                        </span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">{aiRationale.rationale}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {aiRationale.risks.map((risk, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded bg-rose-500/5 border border-rose-500/20 text-[11px] text-rose-200/90"
                          >
                            Risk {idx + 1}: {risk}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400">
                      Click <strong className="text-slate-200">Generate AI Rationale</strong> above for a 3–4 line plain-English summary and 2 setup risks grounded in these computed numbers.
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
