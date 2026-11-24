import { AlertTriangle, BookmarkCheck, BookPlus, Network, Sparkles } from 'lucide-react';
import type {
  ComputedIndicators,
  CorrelationMatrixResult,
  OHLCVBar,
  PositionSizing,
  ShortlistItem,
} from '../lib/data/types.ts';
import { formatInr, formatIstTimestamp, formatPct } from '../lib/format.ts';

interface ShortlistCardsProps {
  shortlist: ShortlistItem[];
  correlation: CorrelationMatrixResult | null;
  onGenerateRationale: () => void;
  onSaveToJournal: () => void;
  savedToJournal: boolean;
  aiLoading: boolean;
  aiError: string | null;
  dataSource: string;
  generatedAt: string;
}

function IntradayMiniChart({
  bars,
  indicators,
  sizing,
}: {
  bars: OHLCVBar[];
  indicators: ComputedIndicators;
  sizing: PositionSizing;
}) {
  if (bars.length < 2) {
    return (
      <div className="px-3 py-2.5 bg-[#0B0F17] border border-slate-800/80 rounded text-[11px] text-slate-500">
        15-min intraday bar series unavailable for sparkline preview.
      </div>
    );
  }

  const levels: number[] = [
    ...bars.map((b) => b.high),
    ...bars.map((b) => b.low),
    sizing.entry,
    sizing.stopLoss,
    sizing.target,
  ];
  if (indicators.vwap !== null) levels.push(indicators.vwap);
  if (indicators.orbHigh !== null) levels.push(indicators.orbHigh);
  if (indicators.orbLow !== null) levels.push(indicators.orbLow);

  const minP = Math.min(...levels);
  const maxP = Math.max(...levels);
  const pad = Math.max(0.1, (maxP - minP) * 0.08);
  const yMin = minP - pad;
  const yMax = maxP + pad;
  const ySpan = Math.max(0.1, yMax - yMin);

  const width = 360;
  const height = 96;
  const leftPad = 8;
  const rightPad = 8;
  const topPad = 8;
  const bottomPad = 8;
  const plotW = width - leftPad - rightPad;
  const plotH = height - topPad - bottomPad;

  const toX = (idx: number) =>
    leftPad + (idx / Math.max(1, bars.length - 1)) * plotW;
  const toY = (price: number) =>
    topPad + ((yMax - price) / ySpan) * plotH;

  const linePoints = bars
    .map((b, idx) => `${toX(idx).toFixed(1)},${toY(b.close).toFixed(1)}`)
    .join(' ');

  const orbTopY = indicators.orbHigh !== null ? toY(indicators.orbHigh) : null;
  const orbBotY = indicators.orbLow !== null ? toY(indicators.orbLow) : null;

  return (
    <div className="px-3 py-2.5 bg-[#0B0F17] border border-slate-800/80 rounded space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="font-mono font-semibold text-slate-200">
          15-Min Session Chart ({bars.length} bars)
        </span>
        <div className="flex flex-wrap items-center gap-2.5 font-mono text-[10px] text-slate-400 tabular-nums">
          {indicators.vwap !== null && (
            <span className="text-sky-400">VWAP ₹{indicators.vwap.toFixed(1)}</span>
          )}
          {indicators.orbHigh !== null && indicators.orbLow !== null && (
            <span className="text-slate-300">
              ORB {indicators.orbLow.toFixed(1)}–{indicators.orbHigh.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-24 block"
        role="img"
        aria-label="15-minute intraday price sparkline with VWAP, ORB, Entry, Stop Loss, and Target lines"
      >
        {/* ORB shaded band */}
        {orbTopY !== null && orbBotY !== null && (
          <rect
            x={leftPad}
            y={Math.min(orbTopY, orbBotY)}
            width={plotW}
            height={Math.max(2, Math.abs(orbBotY - orbTopY))}
            fill="rgba(148, 163, 184, 0.10)"
          />
        )}

        {/* Target line */}
        <line
          x1={leftPad}
          y1={toY(sizing.target)}
          x2={width - rightPad}
          y2={toY(sizing.target)}
          stroke="#34D399"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* Stop Loss line */}
        <line
          x1={leftPad}
          y1={toY(sizing.stopLoss)}
          x2={width - rightPad}
          y2={toY(sizing.stopLoss)}
          stroke="#FB7185"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* Entry line */}
        <line
          x1={leftPad}
          y1={toY(sizing.entry)}
          x2={width - rightPad}
          y2={toY(sizing.entry)}
          stroke="#FBBF24"
          strokeWidth={1}
          strokeDasharray="2 2"
        />

        {/* VWAP line */}
        {indicators.vwap !== null && (
          <line
            x1={leftPad}
            y1={toY(indicators.vwap)}
            x2={width - rightPad}
            y2={toY(indicators.vwap)}
            stroke="#38BDF8"
            strokeWidth={1.2}
            strokeDasharray="4 2"
          />
        )}

        {/* 15m close price line */}
        <polyline
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={linePoints}
        />

        {/* Last close dot */}
        <circle
          cx={toX(bars.length - 1)}
          cy={toY(bars[bars.length - 1].close)}
          r={2.5}
          fill="#FBBF24"
        />
      </svg>

      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-slate-400">
        <span className="text-slate-200">— Price</span>
        <span className="text-sky-400">--- VWAP</span>
        <span className="text-amber-300">--- Entry</span>
        <span className="text-emerald-400">--- Target</span>
        <span className="text-rose-400">--- SL</span>
        <span className="text-slate-400">■ 15m ORB Band</span>
      </div>
    </div>
  );
}

function RiskRewardBar({ sizing }: { sizing: PositionSizing }) {
  const isLong = sizing.direction === 'LONG';
  const riskDist = Math.abs(sizing.entry - sizing.stopLoss);
  const rewardDist = Math.abs(sizing.target - sizing.entry);
  const rrRatio = riskDist > 0 ? rewardDist / riskDist : 2;

  const minPrice = Math.min(sizing.stopLoss, sizing.entry, sizing.target);
  const maxPrice = Math.max(sizing.stopLoss, sizing.entry, sizing.target);
  const span = Math.max(0.05, maxPrice - minPrice);

  const trackStart = 6;
  const trackWidth = 348;
  const toX = (price: number) => trackStart + ((price - minPrice) / span) * trackWidth;

  const xEntry = toX(sizing.entry);
  const xSl = toX(sizing.stopLoss);
  const xTarget = toX(sizing.target);

  const riskLeft = Math.min(xEntry, xSl);
  const riskWidth = Math.max(2, Math.abs(xSl - xEntry));
  const rewardLeft = Math.min(xEntry, xTarget);
  const rewardWidth = Math.max(2, Math.abs(xTarget - xEntry));

  return (
    <div
      className="px-3 py-2.5 bg-[#0B0F17] border border-slate-800/80 rounded space-y-1.5"
      aria-label={`Risk to reward visual scale 1 to ${rrRatio.toFixed(2)}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="font-mono font-semibold text-slate-200">
          Price Scale · R:R 1 : {rrRatio.toFixed(2)}
        </span>
        <span className="font-mono text-slate-400 tabular-nums">
          <span className="text-rose-400">Risk {formatInr(riskDist)}/sh</span>
          <span className="mx-1.5 text-slate-600">vs</span>
          <span className="text-emerald-400">Reward {formatInr(rewardDist)}/sh</span>
        </span>
      </div>

      <svg
        viewBox="0 0 360 40"
        className="w-full h-10 block"
        role="img"
        aria-label={`Price axis from ${formatInr(minPrice)} to ${formatInr(maxPrice)}`}
      >
        <rect x={trackStart} y={7} width={trackWidth} height={8} rx={3} fill="#161E2E" />
        <rect
          x={riskLeft}
          y={7}
          width={riskWidth}
          height={8}
          rx={2}
          fill="rgba(244, 63, 94, 0.45)"
          stroke="#FB7185"
          strokeWidth={1}
        />
        <rect
          x={rewardLeft}
          y={7}
          width={rewardWidth}
          height={8}
          rx={2}
          fill="rgba(16, 185, 129, 0.40)"
          stroke="#34D399"
          strokeWidth={1}
        />
        <line x1={xSl} y1={2} x2={xSl} y2={20} stroke="#FB7185" strokeWidth={2} />
        <line x1={xTarget} y1={2} x2={xTarget} y2={20} stroke="#34D399" strokeWidth={2} />
        <line x1={xEntry} y1={1} x2={xEntry} y2={21} stroke="#FBBF24" strokeWidth={2.5} />
        <circle cx={xEntry} cy={11} r={3} fill="#FBBF24" />

        <text
          x={trackStart}
          y={34}
          textAnchor="start"
          fill={isLong ? '#FB7185' : '#34D399'}
          fontSize="10"
          fontFamily="JetBrains Mono, monospace"
        >
          {isLong ? `SL ${formatInr(sizing.stopLoss)}` : `Target ${formatInr(sizing.target)}`}
        </text>
        <text
          x={xEntry}
          y={34}
          textAnchor="middle"
          fill="#FCD34D"
          fontSize="10"
          fontWeight="600"
          fontFamily="JetBrains Mono, monospace"
        >
          {isLong ? 'Buy' : 'Sell'} {formatInr(sizing.entry)}
        </text>
        <text
          x={trackStart + trackWidth}
          y={34}
          textAnchor="end"
          fill={isLong ? '#34D399' : '#FB7185'}
          fontSize="10"
          fontFamily="JetBrains Mono, monospace"
        >
          {isLong ? `Target ${formatInr(sizing.target)}` : `SL ${formatInr(sizing.stopLoss)}`}
        </text>
      </svg>
    </div>
  );
}

function formatCorrValue(r: number | null): string {
  if (r === null) return '—';
  const sign = r > 0 ? '+' : '';
  return `${sign}${r.toFixed(2)}`;
}

function getCellTone(r: number | null, isDiagonal: boolean): string {
  if (isDiagonal) return 'bg-slate-800/70 text-slate-400';
  if (r === null) return 'bg-[#0B0F17] text-slate-500';
  const abs = Math.abs(r);
  if (abs >= 0.7) {
    return r > 0
      ? 'bg-rose-500/20 text-rose-200 border-rose-500/30'
      : 'bg-sky-500/20 text-sky-200 border-sky-500/30';
  }
  if (abs >= 0.45) {
    return 'bg-amber-500/15 text-amber-200';
  }
  return 'bg-emerald-500/10 text-emerald-300';
}

function ShortlistCorrelationPanel({
  correlation,
}: {
  correlation: CorrelationMatrixResult;
}) {
  const badgeStyle =
    correlation.concentrationLevel === 'HIGH_CONCENTRATION'
      ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
      : correlation.concentrationLevel === 'MODERATE_OVERLAP'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';

  const badgeLabel =
    correlation.concentrationLevel === 'HIGH_CONCENTRATION'
      ? 'High Concentration'
      : correlation.concentrationLevel === 'MODERATE_OVERLAP'
        ? 'Moderate Overlap'
        : 'Low Concentration';

  return (
    <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-slate-300" />
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Shortlist Correlation & Concentration Matrix
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            {correlation.summaryNote}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right text-xs font-mono tabular-nums text-slate-300">
            <div>
              Avg Pairwise r:{' '}
              <span className="font-semibold text-slate-100">
                {formatCorrValue(correlation.avgPairwiseCorrelation)}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Lookback: {correlation.lookbackSessions} daily sessions
            </div>
          </div>
          <span className={`px-2.5 py-1 text-xs font-mono font-semibold rounded border ${badgeStyle}`}>
            {badgeLabel}
          </span>
        </div>
      </div>

      {/* N x N Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse font-mono tabular-nums">
          <thead>
            <tr className="border-b border-slate-800/90 text-slate-400">
              <th className="py-2 pr-3 text-left font-medium">Stock / Sector</th>
              {correlation.tickers.map((ticker, idx) => (
                <th key={ticker} className="py-2 px-2 text-center font-semibold text-slate-200">
                  <div>{ticker}</div>
                  <div className="text-[10px] font-normal text-slate-500">
                    {correlation.sectors[idx]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {correlation.tickers.map((rowTicker, i) => (
              <tr key={rowTicker}>
                <td className="py-2 pr-3 text-left">
                  <div className="font-semibold text-slate-200">{rowTicker}</div>
                  <div className="text-[10px] text-slate-500">{correlation.sectors[i]}</div>
                </td>
                {correlation.matrix[i].map((val, j) => {
                  const isDiag = i === j;
                  return (
                    <td key={`${rowTicker}-${correlation.tickers[j]}`} className="p-1 text-center">
                      <div
                        className={`px-2 py-1.5 rounded border border-slate-800/80 ${getCellTone(
                          val,
                          isDiag,
                        )}`}
                      >
                        {isDiag ? '1.00' : formatCorrValue(val)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sector Clusters & High Correlation Alerts */}
      {(correlation.highCorrelationPairs.length > 0 ||
        correlation.sameSectorClusters.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
          {correlation.highCorrelationPairs.length > 0 && (
            <div className="p-3 rounded bg-[#0B0F17] border border-slate-800/80 space-y-1.5">
              <div className="font-semibold text-rose-300">
                High-Correlation Pairs (|r| &ge; 0.70)
              </div>
              <ul className="space-y-1 text-slate-300 font-mono text-[11px]">
                {correlation.highCorrelationPairs.map((pair) => (
                  <li key={`${pair.tickerA}-${pair.tickerB}`}>
                    {pair.tickerA} / {pair.tickerB}: r = {formatCorrValue(pair.correlation)} (
                    {pair.sameSector
                      ? `Both ${pair.sectorA}`
                      : `${pair.sectorA} vs ${pair.sectorB}`}
                    )
                  </li>
                ))}
              </ul>
            </div>
          )}

          {correlation.sameSectorClusters.length > 0 && (
            <div className="p-3 rounded bg-[#0B0F17] border border-slate-800/80 space-y-1.5">
              <div className="font-semibold text-amber-300">Same-Sector Exposure Clusters</div>
              <ul className="space-y-1 text-slate-300 font-mono text-[11px]">
                {correlation.sameSectorClusters.map((cluster) => (
                  <li key={cluster.sector}>
                    {cluster.sector}: {cluster.tickers.join(', ')} ({cluster.tickers.length} setups)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ShortlistCards({
  shortlist,
  correlation,
  onGenerateRationale,
  onSaveToJournal,
  savedToJournal,
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

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onSaveToJournal}
            disabled={shortlist.length === 0}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              savedToJournal
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                : 'bg-slate-800 text-slate-100 border-slate-700 hover:bg-slate-700 disabled:opacity-50'
            }`}
          >
            {savedToJournal ? (
              <>
                <BookmarkCheck className="w-3.5 h-3.5" />
                <span>Saved to Journal</span>
              </>
            ) : (
              <>
                <BookPlus className="w-3.5 h-3.5" />
                <span>Save to Journal</span>
              </>
            )}
          </button>

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
          No NSE stocks matched the current filter thresholds and direction mode. Try switching Direction Mode to Both or adjusting thresholds in Settings.
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
                      {isLong ? 'LONG · Buy' : 'SHORT · Sell'}
                    </span>
                    <div className="font-mono text-xs text-slate-400 mt-1 tabular-nums">
                      LTP {formatInr(s.price)} ({formatPct(s.changePct)})
                    </div>
                  </div>
                </div>

                {/* Price Levels & Quantity Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-2.5 bg-[#0B0F17] border border-slate-800 rounded">
                    <div className="text-[11px] text-slate-400">
                      {isLong ? 'Entry (Buy)' : 'Entry (Sell)'}
                    </div>
                    <div className="font-mono text-sm font-semibold text-slate-100 tabular-nums mt-0.5">
                      {formatInr(sizing.entry)}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#0B0F17] border border-slate-800 rounded">
                    <div className="text-[11px] text-slate-400">Stop Loss</div>
                    <div className="font-mono text-sm font-semibold text-rose-400 tabular-nums mt-0.5">
                      {formatInr(sizing.stopLoss)}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                      {formatPct(((sizing.stopLoss - sizing.entry) / sizing.entry) * 100)}{' '}
                      {isLong ? 'below' : 'above'}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#0B0F17] border border-slate-800 rounded">
                    <div className="text-[11px] text-slate-400">Target (1:2)</div>
                    <div className="font-mono text-sm font-semibold text-emerald-400 tabular-nums mt-0.5">
                      {formatInr(sizing.target)}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                      {formatPct(((sizing.target - sizing.entry) / sizing.entry) * 100)}{' '}
                      {isLong ? 'above' : 'below'}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#0B0F17] border border-slate-800 rounded">
                    <div className="text-[11px] text-slate-400">Quantity</div>
                    <div className="font-mono text-sm font-semibold text-amber-300 tabular-nums mt-0.5">
                      {sizing.quantity} sh
                    </div>
                  </div>
                </div>

                {/* Risk:Reward Visual Scale */}
                <RiskRewardBar sizing={sizing} />

                {/* 15-Min Mini Chart */}
                <IntradayMiniChart
                  bars={s.intraday15mBars}
                  indicators={ev.indicators}
                  sizing={sizing}
                />

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

      {correlation && correlation.tickers.length >= 2 && (
        <ShortlistCorrelationPanel correlation={correlation} />
      )}
    </section>
  );
}
