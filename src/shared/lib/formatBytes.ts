const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** Human-readable byte size. Locale-independent on purpose — the unit suffixes are not translated. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(decimals)} ${UNITS[unit]}`;
}

/** Percentage saved, floored at 0 — a negative reduction is never shown. */
export function percentReduction(before: number, after: number): number {
  if (before <= 0 || after >= before) return 0;
  return Math.round(((before - after) / before) * 100);
}
