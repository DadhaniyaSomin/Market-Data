import { useMemo, useState } from 'react';
import { Bookmark, Search } from 'lucide-react';
import type { StockEvaluation } from '../lib/data/types.ts';
import { formatCompactVolume, formatInr, formatIstTimestamp, formatPct } from '../lib/format.ts';

type CandidateCategory =
  | 'ALL'
  | 'TOP_GAINER'
  | 'TOP_LOSER'
  | 'VOLUME_SHOCKER'
  | 'GAP_UP_DOWN';

interface RawCandidatesTableProps {
  candidates: StockEvaluation[];
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
  dataSource: string;
  generatedAt: string;
  preOpenAvailable: boolean;
}

export function RawCandidatesTable({
  candidates,
  watchlist,
  onToggleWatchlist,
  dataSource,
  generatedAt,
  preOpenAvailable,
}: RawCandidatesTableProps) {
  const [category, setCategory] = useState<CandidateCategory>('ALL');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates
      .filter((ev) => {
        if (q) {
          const hit =
            ev.snapshot.meta.ticker.toLowerCase().includes(q) ||
            ev.snapshot.meta.name.toLowerCase().includes(q) ||
            ev.snapshot.meta.sector.toLowerCase().includes(q);
          if (!hit) return false;
        }
        if (category === 'ALL') return true;
        if (category === 'TOP_GAINER') return ev.snapshot.changePct > 0;
        if (category === 'TOP_LOSER') return ev.snapshot.changePct < 0;
        if (category === 'VOLUME_SHOCKER') return ev.snapshot.volumeRatio >= 1.25;
        if (category === 'GAP_UP_DOWN') return Math.abs(ev.snapshot.gapPct) >= 0.3;
        return true;
      })
      .sort((a, b) => {
        if (category === 'TOP_GAINER') return b.snapshot.changePct - a.snapshot.changePct;
        if (category === 'TOP_LOSER') return a.snapshot.changePct - b.snapshot.changePct;
        if (category === 'VOLUME_SHOCKER') return b.snapshot.volumeRatio - a.snapshot.volumeRatio;
        if (category === 'GAP_UP_DOWN')
          return Math.abs(b.snapshot.gapPct) - Math.abs(a.snapshot.gapPct);
        return b.totalScore - a.totalScore;
      });
  }, [candidates, category, search]);

  return (
    <section
      aria-label="Raw NSE candidates table"
      className="bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden"
    >
      <div className="p-4 sm:p-5 border-b border-slate-800/90 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-200">
              03. Raw Candidates Universe ({candidates.length} NSE Stocks)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Source: {dataSource} · Timestamp: <span className="font-mono">{formatIstTimestamp(generatedAt)}</span>
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter ticker or sector…"
              className="w-full pl-8 pr-3 py-1.5 bg-[#0B0F17] border border-slate-700/80 rounded-md text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: `All (${candidates.length})` },
              { id: 'TOP_GAINER', label: 'Top Gainers' },
              { id: 'TOP_LOSER', label: 'Top Losers' },
              { id: 'VOLUME_SHOCKER', label: 'Volume Shockers' },
              { id: 'GAP_UP_DOWN', label: 'Gap Up / Down' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategory(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                category === tab.id
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-[#0B0F17] text-slate-400 hover:text-slate-100 border border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-[#0E1420] text-[11px] font-semibold text-slate-400">
              <th className="py-2.5 px-3 w-9">Pin</th>
              <th className="py-2.5 px-3">Stock</th>
              <th className="py-2.5 px-3">Sector</th>
              <th className="py-2.5 px-3 text-right">Last / LTP</th>
              <th className="py-2.5 px-3 text-right">Prev Close</th>
              <th className="py-2.5 px-3 text-right">Chg %</th>
              <th className="py-2.5 px-3 text-right">Gap %</th>
              <th className="py-2.5 px-3 text-right">
                {preOpenAvailable ? 'Ind. Open' : 'Open (Session)'}
              </th>
              <th className="py-2.5 px-3 text-right">Volume</th>
              <th className="py-2.5 px-3 text-right">20D Avg Vol</th>
              <th className="py-2.5 px-3 text-right">Vol Ratio</th>
              <th className="py-2.5 px-3">Catalyst / Tags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 text-xs">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-8 text-center text-slate-400">
                  No stocks match the selected filter criteria.
                </td>
              </tr>
            ) : (
              filtered.map((ev) => {
                const s = ev.snapshot;
                const isPinned = watchlist.includes(s.meta.symbol);
                const chgUp = s.changePct > 0;
                const chgDown = s.changePct < 0;
                const gapUp = s.gapPct > 0;
                const gapDown = s.gapPct < 0;

                return (
                  <tr
                    key={s.meta.symbol}
                    className="hover:bg-slate-800/35 transition-colors h-10"
                  >
                    <td className="py-2 px-3">
                      <button
                        type="button"
                        onClick={() => onToggleWatchlist(s.meta.symbol)}
                        aria-label={isPinned ? `Remove ${s.meta.ticker} from watchlist` : `Add ${s.meta.ticker} to watchlist`}
                        className={`p-1 rounded hover:bg-slate-700/60 transition-colors ${
                          isPinned ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <Bookmark className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-100">{s.meta.ticker}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                        {s.meta.name}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-slate-300 whitespace-nowrap">{s.meta.sector}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-100 whitespace-nowrap">
                      {formatInr(s.price)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {formatInr(s.previousClose)}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
                        chgUp ? 'text-emerald-400' : chgDown ? 'text-rose-400' : 'text-slate-300'
                      }`}
                    >
                      {formatPct(s.changePct)}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                        gapUp ? 'text-emerald-400' : gapDown ? 'text-rose-400' : 'text-slate-400'
                      }`}
                    >
                      {formatPct(s.gapPct)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                      {s.preOpenAvailable && s.preOpenIndicativePrice !== null
                        ? formatInr(s.preOpenIndicativePrice)
                        : formatInr(s.open)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                      {formatCompactVolume(
                        s.preOpenAvailable && s.preOpenIndicativeVolume !== null
                          ? s.preOpenIndicativeVolume
                          : s.volume,
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {formatCompactVolume(s.avgVolume20)}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                        s.volumeRatio >= 1.5 ? 'text-amber-300 font-semibold' : 'text-slate-300'
                      }`}
                    >
                      {s.volumeRatio.toFixed(2)}×
                    </td>
                    <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                      <span className="text-[11px]">
                        {ev.catalystStatus === 'FRESH'
                          ? 'Fresh Catalyst'
                          : ev.catalystStatus === 'PRICED_IN'
                            ? 'Priced In (>3%)'
                            : 'Price/Vol Only'}
                        {ev.matchedNews.length > 0 ? ` · ${ev.matchedNews.length} news` : ''}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
