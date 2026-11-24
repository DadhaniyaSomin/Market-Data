import { CheckSquare, RotateCcw, Square } from 'lucide-react';

export interface ChecklistItem {
  id: string;
  label: string;
  detail: string;
  checked: boolean;
}

export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  {
    id: 'macro_check',
    label: 'Verify Overnight Global & GIFT Nifty Bias',
    detail: 'Confirm US close, crude oil, USD/INR, and Risk-On/Off regime before 09:00 IST.',
    checked: false,
  },
  {
    id: 'preopen_check',
    label: 'Check 09:08–09:12 IST Pre-Open Equilibrium',
    detail: 'Verify gap % vs previous close is <= 3% so catalysts are not already exhausted.',
    checked: false,
  },
  {
    id: 'restrictions_check',
    label: 'Confirm No T2T / ASM / 5% Circuit Band Traps',
    detail: 'Ensure all shortlisted picks pass hard-fail restrictions and liquidity checks.',
    checked: false,
  },
  {
    id: 'orb_wait',
    label: 'Wait for First 15-Min Candle Close (09:30 IST)',
    detail: 'Validate VWAP side and 15-min Opening Range Breakout before entering.',
    checked: false,
  },
  {
    id: 'risk_cap',
    label: 'Enforce 1% Max Risk & Hard Stop Loss',
    detail: 'Verify quantity matches capital cap and never average down on a losing trade.',
    checked: false,
  },
  {
    id: 'journal_ready',
    label: 'Record Entry Plan & Exit Discipline',
    detail: 'Confirm 1:2 target level and square-off cutoff before 15:15 IST.',
    checked: false,
  },
];

interface ChecklistPanelProps {
  items: ChecklistItem[];
  onToggle: (id: string) => void;
  onReset: () => void;
}

export function ChecklistPanel({ items, onToggle, onReset }: ChecklistPanelProps) {
  const completed = items.filter((i) => i.checked).length;

  return (
    <section
      aria-label="Daily pre-market checklist"
      className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-200">
            06. Daily Pre-Market Checklist
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Routine verification before executing intraday setups ({completed}/{items.length} completed).
          </p>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/70 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Day
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            className={`text-left p-3.5 rounded-md border transition-colors flex items-start gap-3 ${
              item.checked
                ? 'bg-emerald-500/5 border-emerald-500/30 text-slate-300'
                : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700 text-slate-200'
            }`}
          >
            {item.checked ? (
              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <Square className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <div
                className={`text-xs font-semibold ${
                  item.checked ? 'line-through text-slate-400' : 'text-slate-100'
                }`}
              >
                {item.label}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                {item.detail}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
