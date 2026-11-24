import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Clock, Menu, RefreshCw } from 'lucide-react';
import { CapitalRiskPanel } from './components/CapitalRiskPanel.tsx';
import {
  ChecklistPanel,
  DEFAULT_CHECKLIST,
  type ChecklistItem,
} from './components/ChecklistPanel.tsx';
import { DashboardOverview } from './components/DashboardOverview.tsx';
import { FilterBreakdownTable } from './components/FilterBreakdownTable.tsx';
import { JournalView } from './components/JournalView.tsx';
import { MarketContextBar } from './components/MarketContextBar.tsx';
import { NewsView } from './components/NewsView.tsx';
import { RawCandidatesTable } from './components/RawCandidatesTable.tsx';
import { SectorRiskExposureWidget } from './components/SectorRiskExposureWidget.tsx';
import { SettingsView, type ServerHealthStatus } from './components/SettingsView.tsx';
import { ShortlistCards } from './components/ShortlistCards.tsx';
import { Sidebar, type NavTab } from './components/Sidebar.tsx';
import { WatchlistView } from './components/WatchlistView.tsx';
import type {
  AIRationaleItem,
  CapitalConfig,
  FilterConfig,
  JournalEntry,
  ScanResponse,
} from './lib/data/types.ts';
import { DEFAULT_FILTER_CONFIG } from './lib/engine/filters.ts';
import { DEFAULT_CAPITAL_CONFIG } from './lib/engine/sizing.ts';

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('preopen');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [capitalConfig, setCapitalConfig] = useState<CapitalConfig>(() => ({
    ...DEFAULT_CAPITAL_CONFIG,
    ...readStoredJson<Partial<CapitalConfig>>('preopen_capital_v1', DEFAULT_CAPITAL_CONFIG),
  }));
  const [filterConfig, setFilterConfig] = useState<FilterConfig>(() => ({
    ...DEFAULT_FILTER_CONFIG,
    ...readStoredJson<Partial<FilterConfig>>('preopen_filter_v1', DEFAULT_FILTER_CONFIG),
  }));
  const [watchlist, setWatchlist] = useState<string[]>(() =>
    readStoredJson('preopen_watchlist_v1', ['RELIANCE.NS', 'HDFCBANK.NS', 'TCS.NS', 'SBIN.NS']),
  );
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() =>
    readStoredJson('preopen_checklist_v1', DEFAULT_CHECKLIST),
  );
  const [journal, setJournal] = useState<JournalEntry[]>(() =>
    readStoredJson('preopen_journal_v1', []),
  );
  const [savedShortlistKey, setSavedShortlistKey] = useState<string | null>(null);

  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [health, setHealth] = useState<ServerHealthStatus | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('preopen_capital_v1', JSON.stringify(capitalConfig));
      localStorage.setItem('preopen_filter_v1', JSON.stringify(filterConfig));
      localStorage.setItem('preopen_watchlist_v1', JSON.stringify(watchlist));
      localStorage.setItem('preopen_checklist_v1', JSON.stringify(checklist));
      localStorage.setItem('preopen_journal_v1', JSON.stringify(journal));
    } catch {
      // Ignore storage quota errors
    }
  }, [capitalConfig, filterConfig, watchlist, checklist, journal]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setHealth(data as ServerHealthStatus);
      })
      .catch(() => {});
  }, []);

  const runScan = useCallback(
    async (forceRefresh = false, nextFilter = filterConfig, nextCapital = capitalConfig) => {
      setLoading(true);
      setScanError(null);
      setAiError(null);
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filterConfig: nextFilter,
            capitalConfig: nextCapital,
            forceRefresh,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || `Server error (${res.status})`);
        }
        setScan(data as ScanResponse);
      } catch (err) {
        setScanError(err instanceof Error ? err.message : 'Unable to fetch NSE market scan.');
      } finally {
        setLoading(false);
      }
    },
    [filterConfig, capitalConfig],
  );

  useEffect(() => {
    runScan(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateRationale = async () => {
    if (!scan || scan.shortlist.length === 0) return;
    setAiLoading(true);
    setAiError(null);

    try {
      const stocks = scan.shortlist.map((item) => ({
        ticker: item.evaluation.snapshot.meta.ticker,
        name: item.evaluation.snapshot.meta.name,
        sector: item.evaluation.snapshot.meta.sector,
        direction: item.sizing.direction,
        price: Number(item.evaluation.snapshot.price.toFixed(2)),
        changePct: Number(item.evaluation.snapshot.changePct.toFixed(2)),
        gapPct: Number(item.evaluation.snapshot.gapPct.toFixed(2)),
        volumeRatio: Number(item.evaluation.snapshot.volumeRatio.toFixed(2)),
        atr14DailyPct: Number(item.evaluation.indicators.atr14DailyPct.toFixed(2)),
        vwap:
          item.evaluation.indicators.vwap !== null
            ? Number(item.evaluation.indicators.vwap.toFixed(2))
            : null,
        orbHigh:
          item.evaluation.indicators.orbHigh !== null
            ? Number(item.evaluation.indicators.orbHigh.toFixed(2))
            : null,
        orbLow:
          item.evaluation.indicators.orbLow !== null
            ? Number(item.evaluation.indicators.orbLow.toFixed(2))
            : null,
        relativeStrengthVsNifty: Number(
          item.evaluation.indicators.relativeStrengthVsNifty.toFixed(2),
        ),
        totalScore: item.evaluation.totalScore,
        catalystStatus: item.evaluation.catalystStatus,
        headlines: item.evaluation.matchedNews.map((n) => n.title),
        entry: item.sizing.entry,
        stopLoss: item.sizing.stopLoss,
        target: item.sizing.target,
        quantity: item.sizing.quantity,
        plannedRisk: item.sizing.plannedRisk,
        capitalUsed: item.sizing.capitalUsed,
      }));

      const marketContextSummary = `Regime: ${scan.marketContext.riskRegime} (${scan.marketContext.riskRationale}). Nifty50 Chg: ${scan.marketContext.nifty50.changePct?.toFixed(2) ?? 'N/A'}%, BankNifty Chg: ${scan.marketContext.bankNifty.changePct?.toFixed(2) ?? 'N/A'}%.`;

      const res = await fetch('/api/rationale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stocks,
          marketContextSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAiError(data?.error || `AI request failed (${res.status})`);
      }

      const rationales: AIRationaleItem[] = Array.isArray(data?.rationales)
        ? data.rationales
        : [];
      if (rationales.length > 0) {
        setScan((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            shortlist: prev.shortlist.map((item) => {
              const match = rationales.find(
                (r) => r.ticker === item.evaluation.snapshot.meta.ticker.toUpperCase(),
              );
              return match ? { ...item, aiRationale: match } : item;
            }),
          };
        });
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to reach AI rationale endpoint.');
    } finally {
      setAiLoading(false);
    }
  };

  const toggleWatchlist = (symbol: string) => {
    setWatchlist((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol],
    );
  };

  const toggleChecklist = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    );
  };

  const resetChecklist = () => {
    setChecklist(DEFAULT_CHECKLIST.map((item) => ({ ...item, checked: false })));
  };

  const handleSaveToJournal = () => {
    if (!scan || scan.shortlist.length === 0) return;
    const nowIso = new Date().toISOString();
    const newEntries: JournalEntry[] = scan.shortlist.map((item) => ({
      id: `${scan.generatedAt}-${item.evaluation.snapshot.meta.ticker}-${Math.random().toString(36).slice(2, 7)}`,
      savedAt: nowIso,
      sessionDate: scan.session.istDateDisplay,
      ticker: item.evaluation.snapshot.meta.ticker,
      name: item.evaluation.snapshot.meta.name,
      sector: item.evaluation.snapshot.meta.sector,
      direction: item.sizing.direction,
      entry: item.sizing.entry,
      stopLoss: item.sizing.stopLoss,
      target: item.sizing.target,
      quantity: item.sizing.quantity,
      plannedRisk: item.sizing.plannedRisk,
      score: item.evaluation.totalScore,
      outcome: 'PENDING',
      realizedPnl: null,
      notes: '',
    }));

    setJournal((prev) => [...newEntries, ...prev]);
    setSavedShortlistKey(scan.generatedAt);
  };

  const handleUpdateJournalEntry = (id: string, patch: Partial<JournalEntry>) => {
    setJournal((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const handleDeleteJournalEntry = (id: string) => {
    setJournal((prev) => prev.filter((e) => e.id !== id));
  };

  const handleClearJournal = () => {
    setJournal([]);
  };

  const pageTitle =
    activeTab === 'dashboard'
      ? 'Dashboard Overview'
      : activeTab === 'preopen'
        ? 'Intraday Pre-Open Scanner'
        : activeTab === 'news'
          ? 'Latest Market News & AI Impact'
          : activeTab === 'journal'
            ? 'Trade Journal & Archive'
            : activeTab === 'watchlist'
              ? 'Watchlist'
              : 'Scanner Settings';

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-200 flex">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        watchlistCount={watchlist.length}
        journalCount={journal.length}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-[#0B0F17]/95 backdrop-blur border-b border-slate-800/80 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-md text-slate-300 hover:bg-slate-800"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg font-bold text-slate-100 truncate">
                {pageTitle}
              </h1>
              {scan && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="font-mono text-amber-300">{scan.session.label}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{scan.session.istTimeDisplay}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => runScan(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Scanning…' : 'Refresh Market Data'}</span>
            </button>
          </div>
        </header>

        {/* Persistent Educational Disclaimer */}
        <div className="bg-[#101622] border-b border-slate-800/70 px-4 sm:px-6 py-2 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong className="text-slate-300">Disclaimer:</strong> Educational pre-market decision-support tool, not investment advice or a tip service. Exchange data may be delayed; read-only v1 (no order execution).
          </span>
          {scan && (
            <span className="font-mono text-slate-400">
              {scan.session.istDateDisplay}
            </span>
          )}
        </div>

        <main className="flex-1 px-4 sm:px-6 py-6 max-w-[1440px] w-full mx-auto space-y-6">
          {/* Market Closed or Pre-Open Data Unavailable Notices */}
          {scan?.session.isMarketClosed && (
            <div className="p-3.5 rounded-lg bg-slate-800/50 border border-slate-700/80 text-xs text-slate-300 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-100">Market Closed State:</span>{' '}
                {scan.session.sessionNote}
              </div>
            </div>
          )}

          {scan?.preOpenUnavailableNote && (
            <div className="p-3.5 rounded-lg bg-amber-500/5 border border-amber-500/25 text-xs text-amber-200/90 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-300">Pre-Open Notice:</span>{' '}
                {scan.preOpenUnavailableNote}
              </div>
            </div>
          )}

          {scan?.dataProviderNote && (
            <div className="p-3.5 rounded-lg bg-slate-800/50 border border-slate-700/80 text-xs text-slate-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-100">Market Data Provider:</span>{' '}
                {scan.dataProviderNote}
              </div>
            </div>
          )}

          {scanError && (
            <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/35 text-xs text-rose-200 flex items-center justify-between gap-4">
              <div>
                <span className="font-semibold">Market Scan Error:</span> {scanError}
              </div>
              <button
                type="button"
                onClick={() => runScan(true)}
                className="px-3 py-1.5 rounded bg-rose-500 text-white font-semibold shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading Skeleton */}
          {loading && !scan && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 rounded-lg bg-[#111827] border border-slate-800 animate-pulse"
                  />
                ))}
              </div>
              <div className="h-36 rounded-lg bg-[#111827] border border-slate-800 animate-pulse" />
              <div className="h-72 rounded-lg bg-[#111827] border border-slate-800 animate-pulse" />
            </div>
          )}

          {/* Active Views */}
          {scan && activeTab === 'dashboard' && (
            <DashboardOverview
              scan={scan}
              totalCapital={capitalConfig.totalCapital}
              checklist={checklist}
              onGoToPreOpen={() => setActiveTab('preopen')}
            />
          )}

          {scan && activeTab === 'preopen' && (
            <div className="space-y-6">
              <MarketContextBar
                context={scan.marketContext}
                sectorBreadth={scan.sectorBreadth}
              />

              <CapitalRiskPanel
                config={capitalConfig}
                onChange={setCapitalConfig}
                onApplyAndRecalculate={() => runScan(false, filterConfig, capitalConfig)}
                isLoading={loading}
              />

              <RawCandidatesTable
                candidates={scan.candidates}
                watchlist={watchlist}
                onToggleWatchlist={toggleWatchlist}
                dataSource={scan.dataSource}
                generatedAt={scan.generatedAt}
                preOpenAvailable={!scan.preOpenUnavailableNote}
              />

              <FilterBreakdownTable
                evaluations={scan.candidates}
                dataSource={scan.dataSource}
                generatedAt={scan.generatedAt}
              />

              <ShortlistCards
                shortlist={scan.shortlist}
                correlation={scan.correlation}
                onGenerateRationale={handleGenerateRationale}
                onSaveToJournal={handleSaveToJournal}
                savedToJournal={savedShortlistKey === scan.generatedAt}
                aiLoading={aiLoading}
                aiError={aiError}
                dataSource={scan.dataSource}
                generatedAt={scan.generatedAt}
              />

              <SectorRiskExposureWidget
                shortlist={scan.shortlist}
                totalCapital={capitalConfig.totalCapital}
              />

              <ChecklistPanel
                items={checklist}
                onToggle={toggleChecklist}
                onReset={resetChecklist}
              />
            </div>
          )}

          {activeTab === 'news' && (
            <NewsView sectorBreadth={scan?.sectorBreadth ?? []} />
          )}

          {activeTab === 'journal' && (
            <JournalView
              entries={journal}
              onUpdateEntry={handleUpdateJournalEntry}
              onDeleteEntry={handleDeleteJournalEntry}
              onClearAll={handleClearJournal}
            />
          )}

          {scan && activeTab === 'watchlist' && (
            <WatchlistView
              evaluations={scan.candidates}
              watchlist={watchlist}
              onToggleWatchlist={toggleWatchlist}
              dataSource={scan.dataSource}
              generatedAt={scan.generatedAt}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              filterConfig={filterConfig}
              onChangeFilter={setFilterConfig}
              onApplySettings={() => {
                runScan(false, filterConfig, capitalConfig);
                setActiveTab('preopen');
              }}
              health={health}
              isLoading={loading}
            />
          )}
        </main>
      </div>
    </div>
  );
}
