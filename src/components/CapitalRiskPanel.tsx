import type { CapitalConfig } from '../lib/data/types.ts';
import { formatInr } from '../lib/format.ts';

interface CapitalRiskPanelProps {
  config: CapitalConfig;
  onChange: (next: CapitalConfig) => void;
  onApplyAndRecalculate: () => void;
  isLoading: boolean;
}

export function CapitalRiskPanel({
  config,
  onChange,
  onApplyAndRecalculate,
  isLoading,
}: CapitalRiskPanelProps) {
  const riskPerTradeAmount = config.totalCapital * (config.riskPerTradePct / 100);
  const maxCapitalPerStock = (config.totalCapital / Math.max(1, config.maxStocks)) * 1.5;

  return (
    <section
      aria-label="Capital and risk settings"
      className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-200">
            02. Capital &amp; Risk Parameters
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Position sizes cap per-stock exposure at (Capital / Stocks) × 1.5 and strictly enforce 1:2 R:R.
          </p>
        </div>

        <button
          type="button"
          onClick={onApplyAndRecalculate}
          disabled={isLoading}
          className="px-4 py-2 text-xs font-semibold rounded-md bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
        >
          {isLoading ? 'Recalculating…' : 'Recalculate Sizing'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        <label className="block space-y-1.5">
          <span className="block text-xs font-medium text-slate-300">
            Total Trading Capital (₹)
          </span>
          <input
            type="number"
            min={10000}
            step={10000}
            value={config.totalCapital}
            onChange={(e) => {
              const val = Number(e.target.value);
              onChange({
                ...config,
                totalCapital: Number.isFinite(val) && val >= 0 ? val : 0,
              });
            }}
            className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-700/80 rounded-md font-mono text-sm text-slate-100 tabular-nums focus:outline-none focus:border-amber-500"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="block text-xs font-medium text-slate-300">
            Risk per Trade (%)
          </span>
          <input
            type="number"
            min={0.1}
            max={5}
            step={0.1}
            value={config.riskPerTradePct}
            onChange={(e) => {
              const val = Number(e.target.value);
              onChange({
                ...config,
                riskPerTradePct: Number.isFinite(val) ? val : 1.0,
              });
            }}
            className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-700/80 rounded-md font-mono text-sm text-slate-100 tabular-nums focus:outline-none focus:border-amber-500"
          />
        </label>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-slate-300">
            Max Shortlist Stocks (3–5)
          </span>
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#0B0F17] border border-slate-700/80 rounded-md">
            {[3, 4, 5].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => onChange({ ...config, maxStocks: count })}
                className={`py-1.5 text-xs font-mono font-semibold rounded transition-colors ${
                  config.maxStocks === count
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        <div className="px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-md">
          <div className="text-[11px] text-slate-400">Planned Risk / Trade</div>
          <div className="font-mono text-sm font-semibold text-amber-300 tabular-nums mt-0.5">
            {formatInr(riskPerTradeAmount, 0)}
          </div>
        </div>

        <div className="px-3.5 py-2 bg-[#0B0F17] border border-slate-800 rounded-md">
          <div className="text-[11px] text-slate-400">1.5× Capital Cap / Stock</div>
          <div className="font-mono text-sm font-semibold text-slate-100 tabular-nums mt-0.5">
            {formatInr(maxCapitalPerStock, 0)}
          </div>
        </div>
      </div>
    </section>
  );
}
