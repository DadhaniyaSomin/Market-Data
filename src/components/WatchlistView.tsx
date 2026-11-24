import { Bookmark, Trash2 } from 'lucide-react';
import type { StockEvaluation } from '../lib/data/types.ts';
import { formatCompactVolume, formatInr, formatIstTimestamp, formatPct } from '../lib/format.ts';

interface WatchlistViewProps {
  evaluations: StockEvaluation[];
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
  dataSource: string;
  generatedAt: string;
}

export function WatchlistView({
  evaluations,
  watchlist,
  onToggleWatchlist,
  dataSource,
  generatedAt,
}: WatchlistViewProps) {
  const watched = evaluations.filter((e) => watchlist.includes(e.snapshot.meta.symbol));

  return (
    <div className="space-y-4">
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-200">
              Pinned NSE Watchlist ({watched.length})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Source: {dataSource} · Timestamp: <span className="font-mono">{formatIstTimestamp(generatedAt)}</span> · Pin or unpin any stock from the universe table.
            </p>
          </div>
        </div>

        {watched.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Bookmark className="w-6 h-6 text-slate-500 mx-auto" />
            <p className="text-sm text-slate-300 font-medium">Your watchlist is empty</p>
            <p className="text-xs text-slate-400">
              Use the bookmark icon in the Intraday Pre-Open raw candidates table to pin NSE tickers here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0E1420] text-[11px] font-semibold text-slate-400">
                  <th className="py-2.5 px-4">Stock</th>
                  <th className="py-2.5 px-4">Sector</th>
                  <th className="py-2.5 px-4 text-right">LTP</th>
                  <th className="py-2.5 px-4 text-right">Chg %</th>
                  <th className="py-2.5 px-4 text-right">ATR(14)%</th>
                  <th className="py-2.5 px-4 text-right">20D Avg Vol</th>
                  <th className="py-2.5 px-4 text-right">Filter Score</th>
                  <th className="py-2.5 px-4">Bias</th>
                  <th className="py-2.5 px-4 text-right">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {watched.map((ev) => (
                  <tr key={ev.snapshot.meta.symbol} className="hover:bg-slate-800/35">
                    <td className="py-2.5 px-4">
                      <div className="font-semibold text-slate-100">{ev.snapshot.meta.ticker}</div>
                      <div className="text-[11px] text-slate-400">{ev.snapshot.meta.name}</div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">{ev.snapshot.meta.sector}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-100">
                      {formatInr(ev.snapshot.price)}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums ${
                        ev.snapshot.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatPct(ev.snapshot.changePct)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                      {ev.indicators.atr14DailyPct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-400">
                      {formatCompactVolume(ev.snapshot.avgVolume20)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-100">
                      {ev.totalScore}/10
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-300">{ev.direction}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onToggleWatchlist(ev.snapshot.meta.symbol)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                        aria-label={`Remove ${ev.snapshot.meta.ticker}`}
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
