import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { IndexQuote, MarketContext } from '../lib/data/types.ts';
import { formatIstTimestamp, formatNumber, formatPct } from '../lib/format.ts';

interface MarketContextBarProps {
  context: MarketContext;
}

function MetricCell({ quote, decimals = 2 }: { quote: IndexQuote; decimals?: number }) {
  const isUp = quote.changePct !== null && quote.changePct > 0;
  const isDown = quote.changePct !== null && quote.changePct < 0;

  return (
    <div className="px-4 py-3 bg-[#111827] border border-slate-800/90 rounded-lg flex flex-col justify-between min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-400 truncate">{quote.name}</span>
        {quote.changePct !== null && (
          <span
            className={`font-mono text-xs font-medium tabular-nums inline-flex items-center gap-0.5 shrink-0 ${
              isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-slate-400'
            }`}
          >
            {isUp ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : isDown ? (
              <ArrowDownRight className="w-3 h-3" />
            ) : (
              <Minus className="w-3 h-3" />
            )}
            {formatPct(quote.changePct)}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-base font-semibold text-slate-100 tabular-nums">
          {quote.price !== null ? formatNumber(quote.price, decimals) : 'Unavailable'}
        </span>
        {quote.note && (
          <span className="text-[11px] text-slate-400 truncate" title={quote.note}>
            {quote.note}
          </span>
        )}
      </div>
    </div>
  );
}

export function MarketContextBar({ context }: MarketContextBarProps) {
  const regimeConfig =
    context.riskRegime === 'RISK_ON'
      ? {
          label: 'Risk-On',
          cls: 'text-emerald-300 border-emerald-500/35 bg-emerald-500/10',
        }
      : context.riskRegime === 'RISK_OFF'
        ? {
            label: 'Risk-Off',
            cls: 'text-rose-300 border-rose-500/35 bg-rose-500/10',
          }
        : {
            label: 'Neutral',
            cls: 'text-amber-300 border-amber-500/35 bg-amber-500/10',
          };

  return (
    <section aria-label="Market context bar" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-sm font-semibold text-slate-200">
            01. Market Context
          </h2>
          <span className={`px-2.5 py-0.5 text-xs font-semibold rounded border ${regimeConfig.cls}`}>
            Regime: {regimeConfig.label}
          </span>
          <span className="text-xs text-slate-400">{context.riskRationale}</span>
        </div>
        <div className="text-xs text-slate-400 font-mono tabular-nums">
          {context.source} · {formatIstTimestamp(context.timestamp)}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCell quote={context.giftNifty} />
        <MetricCell quote={context.nifty50} />
        <MetricCell quote={context.bankNifty} />
        <MetricCell quote={context.usClose} />
        <MetricCell quote={context.brentCrude} />
        <MetricCell quote={context.usdInr} decimals={4} />
      </div>
    </section>
  );
}
