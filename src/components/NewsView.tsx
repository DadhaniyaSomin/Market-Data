import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Newspaper,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import type { NewsImpactItem, NewsItem, SectorBreadthItem } from '../lib/data/types.ts';
import { formatIstTimestamp, formatPct } from '../lib/format.ts';

interface NewsViewProps {
  sectorBreadth: SectorBreadthItem[];
}

type NewsFilter = 'ALL' | 'COMPANY' | 'SECTOR' | 'RESULTS';

export function NewsView({ sectorBreadth }: NewsViewProps) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [source, setSource] = useState<string>('Economic Times Markets + LiveMint Markets');
  const [fetchedAt, setFetchedAt] = useState<string>(new Date().toISOString());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<NewsFilter>('ALL');
  const [search, setSearch] = useState<string>('');

  const [impactMap, setImpactMap] = useState<Record<string, NewsImpactItem>>({});
  const [impactLoading, setImpactLoading] = useState<boolean>(false);
  const [impactError, setImpactError] = useState<string | null>(null);

  const fetchLatestNews = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/news${forceRefresh ? '?refresh=1' : ''}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Failed to load RSS news (${res.status})`);
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      if (data.source) setSource(data.source);
      if (data.fetchedAt) setFetchedAt(data.fetchedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch latest RSS headlines.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatestNews(false);
  }, [fetchLatestNews]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (q) {
        const hit =
          item.title.toLowerCase().includes(q) ||
          item.summary.toLowerCase().includes(q) ||
          item.matchedSectors.some((s) => s.toLowerCase().includes(q)) ||
          item.matchedSymbols.some((s) => s.toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (filter === 'COMPANY') return item.matchedSymbols.length > 0 && !item.isSectorNews;
      if (filter === 'SECTOR') return item.matchedSectors.length > 0 || item.isSectorNews;
      if (filter === 'RESULTS') return item.isResultsNews;
      return true;
    });
  }, [items, filter, search]);

  const analyzeBatch = async (targetHeadlines: NewsItem[]) => {
    if (targetHeadlines.length === 0) return;
    setImpactLoading(true);
    setImpactError(null);

    try {
      const sectorSummary =
        sectorBreadth.length > 0
          ? sectorBreadth
              .map((s) => `${s.sector}: ${formatPct(s.avgChangePct)} (${s.advancers}/${s.total} adv)`)
              .join('; ')
          : 'NSE Equities Session';

      const res = await fetch('/api/news-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headlines: targetHeadlines.slice(0, 8),
          sectorContextSummary: sectorSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setImpactError(data?.error || `AI impact request failed (${res.status})`);
      }

      const list: NewsImpactItem[] = Array.isArray(data?.impacts) ? data.impacts : [];
      if (list.length > 0) {
        setImpactMap((prev) => {
          const next = { ...prev };
          for (const imp of list) {
            next[imp.id] = imp;
          }
          return next;
        });
      }
    } catch (err) {
      setImpactError(err instanceof Error ? err.message : 'Unable to analyze news impact.');
    } finally {
      setImpactLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls & Header */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-200">
              Latest Indian Market News &amp; AI Reaction Analyzer
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Source: {source} · Timestamp: <span className="font-mono">{formatIstTimestamp(fetchedAt)}</span> · {items.length} headlines loaded
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fetchLatestNews(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Fetching…' : 'Fetch Latest News'}</span>
            </button>

            <button
              type="button"
              onClick={() => analyzeBatch(filteredItems.slice(0, 6))}
              disabled={impactLoading || filteredItems.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {impactLoading ? 'Analyzing Impact…' : 'Analyze Top 6 with AI'}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `All (${items.length})` },
                { id: 'COMPANY', label: 'Company Specific' },
                { id: 'SECTOR', label: 'Sector / Macro' },
                { id: 'RESULTS', label: 'Earnings / Results' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  filter === tab.id
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-[#0B0F17] text-slate-400 hover:text-slate-100 border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stock, sector, keyword…"
              className="w-full pl-8 pr-3 py-1.5 bg-[#0B0F17] border border-slate-700/80 rounded-md text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {impactError && (
          <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">AI Impact Unavailable:</span> {impactError}
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/35 text-xs text-rose-200">
            {error}
          </div>
        )}
      </section>

      {/* News List */}
      {loading && items.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-lg bg-[#111827] border border-slate-800 animate-pulse"
            />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-10 text-center space-y-2">
          <Newspaper className="w-6 h-6 text-slate-500 mx-auto" />
          <p className="text-sm text-slate-300 font-medium">No matching headlines found</p>
          <p className="text-xs text-slate-400">
            Clear your search filter or click Fetch Latest News to refresh the RSS feeds.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.slice(0, 30).map((item) => {
            const impact = impactMap[item.id];
            const tickers = item.matchedSymbols.map((s) => s.replace('.NS', ''));

            return (
              <article
                key={item.id}
                className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300">{item.source}</span>
                      {item.pubDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{item.pubDate}</span>
                        </>
                      )}
                      {item.matchedSectors.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-300">
                            Sectors: {item.matchedSectors.join(', ')}
                          </span>
                        </>
                      )}
                      {tickers.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-sky-300">
                            Stocks: {tickers.slice(0, 5).join(', ')}
                            {tickers.length > 5 ? ` +${tickers.length - 5}` : ''}
                          </span>
                        </>
                      )}
                    </div>

                    <h3 className="font-display text-sm font-semibold text-slate-100 leading-snug">
                      {item.title}
                    </h3>

                    {item.summary && (
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => analyzeBatch([item])}
                      disabled={impactLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#0B0F17] border border-slate-700 text-slate-200 hover:border-amber-500/50 hover:text-amber-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      <Sparkles className="w-3 h-3" />
                      {impact ? 'Re-analyze' : 'AI Impact'}
                    </button>

                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded bg-[#0B0F17] border border-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
                        aria-label="Open original news article"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {impact && (
                  <div className="p-3.5 bg-[#0B0F17] border border-slate-800 rounded-md space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded border ${
                            impact.expectedDirection === 'POSITIVE'
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/35'
                              : impact.expectedDirection === 'NEGATIVE'
                                ? 'bg-rose-500/10 text-rose-300 border-rose-500/35'
                                : 'bg-amber-500/10 text-amber-300 border-amber-500/35'
                          }`}
                        >
                          {impact.expectedDirection}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {impact.scope} · {impact.targetEntity}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500">
                        Gemini · {impact.model}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold text-slate-300">
                          Sector Reaction
                        </div>
                        <p className="text-slate-400 leading-relaxed">{impact.sectorReaction}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold text-slate-300">
                          Company / Stock Reaction
                        </div>
                        <p className="text-slate-400 leading-relaxed">{impact.companyReaction}</p>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-slate-800/70 text-[11px] text-amber-200/90">
                      <span className="font-semibold text-amber-300">Watch Point:</span>{' '}
                      {impact.watchPoint}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
