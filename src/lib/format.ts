export function formatInr(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCompactVolume(shares: number): string {
  if (!Number.isFinite(shares)) return '—';
  if (shares >= 10_000_000) return `${(shares / 10_000_000).toFixed(2)} Cr`;
  if (shares >= 100_000) return `${(shares / 100_000).toFixed(2)} L`;
  return Math.round(shares).toLocaleString('en-IN');
}

export function formatPct(value: number | null, withSign = true): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = withSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatIstTimestamp(iso: string): string {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return `${new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(dt)} IST`;
  } catch {
    return iso;
  }
}
