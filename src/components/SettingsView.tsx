import { RotateCcw } from 'lucide-react';
import type { FilterConfig } from '../lib/data/types.ts';
import { DEFAULT_FILTER_CONFIG } from '../lib/engine/filters.ts';

export interface ServerHealthStatus {
  dataProvider: string;
  twelveDataConfigured: boolean;
  geminiConfigured: boolean;
  aiModel: string;
}

interface SettingsViewProps {
  filterConfig: FilterConfig;
  onChangeFilter: (next: FilterConfig) => void;
  onApplySettings: () => void;
  health: ServerHealthStatus | null;
  isLoading: boolean;
}

export function SettingsView({
  filterConfig,
  onChangeFilter,
  onApplySettings,
  health,
  isLoading,
}: SettingsViewProps) {
  const numField = (
    label: string,
    key: keyof FilterConfig,
    step: number,
    min: number,
    max: number,
    hint: string,
  ) => (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-slate-200">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={filterConfig[key]}
        onChange={(e) => {
          const val = Number(e.target.value);
          if (Number.isFinite(val)) {
            onChangeFilter({ ...filterConfig, [key]: val });
          }
        }}
        className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-700/80 rounded-md font-mono text-sm text-slate-100 tabular-nums focus:outline-none focus:border-amber-500"
      />
      <span className="block text-[11px] text-slate-400">{hint}</span>
    </label>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-200">
              Deterministic 5-Point Filter Thresholds
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Changes re-score all 28 NSE universe stocks immediately when applied.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChangeFilter(DEFAULT_FILTER_CONFIG)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/70 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restore Defaults
            </button>
            <button
              type="button"
              onClick={onApplySettings}
              disabled={isLoading}
              className="px-4 py-1.5 text-xs font-semibold rounded-md bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {isLoading ? 'Applying…' : 'Apply & Rescan'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {numField(
            'Min 20D Avg Volume (Shares)',
            'minAvgVolume',
            100000,
            50000,
            50000000,
            'Default: 1,000,000 shares/day',
          )}
          {numField(
            'Max Bid-Ask Spread (%)',
            'maxSpreadPct',
            0.01,
            0.01,
            2.0,
            'Default: < 0.10% of price',
          )}
          {numField(
            'Min Daily ATR(14) %',
            'minAtrPct',
            0.1,
            0.2,
            5.0,
            'Default: 1.5% minimum volatility',
          )}
          {numField(
            'Max Daily ATR(14) %',
            'maxAtrPct',
            0.1,
            0.5,
            10.0,
            'Default: 2.5% maximum volatility',
          )}
          {numField(
            'Min Stock Price (₹)',
            'minPrice',
            10,
            10,
            10000,
            'Exclude penny/low-price stocks below ₹100',
          )}
          {numField(
            'Min Free Float (%)',
            'minFreeFloatPct',
            1,
            5,
            90,
            'Default: 25% minimum public float',
          )}
          {numField(
            'Unusual Volume Multiplier (×)',
            'unusualVolumeMultiplier',
            0.1,
            1.0,
            5.0,
            'Default: 1.5× 20-day avg volume',
          )}
          {numField(
            'Priced-In Move Cutoff (%)',
            'pricedInMovePct',
            0.25,
            1.0,
            15.0,
            'Moves > 3.0% mark catalyst as Priced In',
          )}
        </div>
      </section>

      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-200">
            Market Data &amp; AI Provider Configuration
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            API keys (<span className="font-mono">TWELVEDATA_API_KEY</span> and{' '}
            <span className="font-mono">GEMINI_API_KEY</span>) are read strictly from server{' '}
            <span className="font-mono">.env</span> secrets.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-[#0B0F17] border border-slate-800 rounded-md space-y-2">
            <div className="text-xs font-semibold text-slate-200">Market Data Provider</div>
            <div
              className={`font-mono text-xs ${
                health?.twelveDataConfigured ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              {health?.dataProvider ?? 'Twelve Data / Yahoo Fallback'}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {health?.twelveDataConfigured
                ? 'TWELVEDATA_API_KEY detected in server environment. Fetching NSE quotes and 15-min/daily series from Twelve Data.'
                : 'Add TWELVEDATA_API_KEY in .env to switch automatically from Yahoo Finance fallback to Twelve Data API.'}
            </p>
          </div>

          <div className="p-4 bg-[#0B0F17] border border-slate-800 rounded-md space-y-2">
            <div className="text-xs font-semibold text-slate-200">AI Narrative Provider</div>
            <div
              className={`font-mono text-xs ${
                health?.geminiConfigured ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              Gemini ({health?.aiModel ?? 'gemini-4-hydrogen'}) ·{' '}
              {health?.geminiConfigured ? 'Configured' : 'Key unset'}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Generates 3–4 line setup rationales and 2 risks in structured JSON strictly from pre-computed numbers. Add <span className="font-mono">GEMINI_API_KEY</span> in <span className="font-mono">.env</span>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
